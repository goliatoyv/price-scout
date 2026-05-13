import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import Anthropic from '@anthropic-ai/sdk'
import { fetchPage, canRender } from '@/lib/scraper/fetch'
import { isHardSite } from '@/lib/scraper/hard-sites'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000 })

interface Candidate {
  url:   string
  name:  string
}

function looksLikeProductLink(href: string, base: URL): URL | null {
  try {
    const abs = new URL(href, base)
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null
    // Keep only same-host links — products always live on the same domain.
    if (abs.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return null
    // Drop obvious nav / filter / anchor links.
    if (abs.pathname === '/' || abs.pathname === base.pathname) return null
    if (/^\/(account|cart|help|support|search|wishlist|sign|login|logout|register)(\/|$)/i.test(abs.pathname)) return null
    if (abs.hash) abs.hash = ''
    return abs
  } catch {
    return null
  }
}

function extractCandidates(html: string, baseUrl: string): Candidate[] {
  const $ = cheerio.load(html)
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const out: Candidate[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const abs = looksLikeProductLink(href, base)
    if (!abs) return
    const key = abs.toString()
    if (seen.has(key)) return
    seen.add(key)

    // Name candidate: anchor text, then aria-label, then title, then nearest heading inside.
    const name =
      ($(el).text() || '').trim() ||
      $(el).attr('aria-label') ||
      $(el).attr('title') ||
      $(el).find('h1, h2, h3, h4, [class*="name"], [class*="title"]').first().text().trim() ||
      ''

    out.push({ url: key, name: name.slice(0, 120) })
  })

  return out
}

export async function POST(req: Request) {
  let url: string | undefined
  try {
    const body = await req.json()
    url = body?.url
  } catch {
    return NextResponse.json({ error: 'Невірний JSON' }, { status: 400 })
  }
  if (!url) return NextResponse.json({ error: 'URL обовʼязковий' }, { status: 400 })

  // Try direct fetch first; only escalate to ScraperAPI render for known-hard
  // SPA hosts. If a regular site yields no candidates we also do one render
  // retry (rare; helps when a server-rendered shop is briefly behind a
  // bot wall) — but only for hard hosts so unknown domains don't burn credits.
  const hard = isHardSite(url)
  let html: string
  try {
    const first = await fetchPage(url, hard && canRender())
    html = first.html
    if (!html || html.length < 500) {
      return NextResponse.json({ error: 'Сторінка повернула порожню відповідь' }, { status: 502 })
    }
  } catch (e) {
    console.error('[scrape/category] fetch failed', { url, error: e })
    return NextResponse.json({ error: 'Не вдалося завантажити сторінку' }, { status: 502 })
  }

  let candidates = extractCandidates(html, url)

  if (candidates.length === 0 && hard && canRender()) {
    // Hard site, but we somehow had it cached/unrendered — try one render pass.
    try {
      const rerender = await fetchPage(url, true)
      if (rerender.html && rerender.html.length >= 500) {
        html = rerender.html
        candidates = extractCandidates(html, url)
      }
    } catch { /* ignore */ }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ products: [], total: 0 })
  }

  // Trim to keep the LLM prompt small. 300 candidates × ~150 chars ≈ 45k chars, safely under context.
  const linksText = candidates
    .slice(0, 300)
    .map(c => `${c.url} | ${c.name}`)
    .join('\n')

  let products: Candidate[] = []
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are given a list of links from a product category page (URL: ${url}).
Extract ONLY individual product page URLs (not category, filter, pagination, or nav links).
Heuristics: product URLs usually contain a SKU, slug-like product name, or look like /p/<slug> or /products/<slug>.
Return ONLY a JSON array, no explanation: [{"url":"...","name":"..."}]
Deduplicate. Max 100 items. If "name" looks empty or generic, derive a short readable name from the URL slug.

Links:
${linksText}`,
      }],
    })

    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    const match = raw.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) {
        products = parsed
          .filter(p => p && typeof p.url === 'string')
          .map(p => ({ url: String(p.url), name: typeof p.name === 'string' ? p.name : '' }))
      }
    }
  } catch (e) {
    console.error('[scrape/category] LLM failed', e)
    // Fall back to raw candidates — better than nothing if LLM key is broken.
    products = candidates.slice(0, 100)
  }

  return NextResponse.json({ products, total: products.length })
}
