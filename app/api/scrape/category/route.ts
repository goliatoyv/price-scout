import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchPage(url: string): Promise<string> {
  const key = process.env.SCRAPER_API_KEY
  const fetchUrl = key
    ? `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}`
    : url
  const r = await fetch(fetchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
    signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL обовʼязковий' }, { status: 400 })

    const html = await fetchPage(url)

    // Extract <a href> tags — cheaper than sending full HTML to LLM
    const linkMatches = Array.from(html.matchAll(/<a[^>]+href="([^"#?][^"]*)"[^>]*>([^<]{3,80})</gi))
    const base = new URL(url)
    const linksText = linkMatches
      .map(m => {
        try {
          const abs = new URL(m[1], base).toString()
          return `${abs} | ${m[2].trim()}`
        } catch { return null }
      })
      .filter(Boolean)
      .slice(0, 300)
      .join('\n')

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are given a list of links from a product category page (URL: ${url}).
Extract ONLY individual product page URLs (not category, filter, pagination, or nav links).
Return ONLY a JSON array, no explanation: [{"url":"...","name":"..."}]
Deduplicate. Max 100 items.

Links:
${linksText}`,
      }],
    })

    let products: { url: string; name: string }[] = []
    try {
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) products = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'Не вдалося розпарсити відповідь LLM' }, { status: 500 })
    }

    return NextResponse.json({ products, total: products.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
