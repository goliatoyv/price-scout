import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductData {
  price:          number
  original_price: number | null
  currency:       string
  in_stock:       boolean
  name:           string | null
  image_url:      string | null
}

interface SiteStrategy {
  strategy: 'json_ld' | 'og_meta' | 'llm'
  needs_js: boolean
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

async function fetchPage(url: string, render = false): Promise<string> {
  const key = process.env.SCRAPER_API_KEY
  let fetchUrl = url
  if (key) {
    const params = new URLSearchParams({ api_key: key, url })
    if (render) params.set('render', 'true')
    fetchUrl = `http://api.scraperapi.com?${params}`
  }
  const r = await fetch(fetchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
    signal: AbortSignal.timeout(40000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

// ─── Extraction methods ───────────────────────────────────────────────────────

function extractJsonLd(html: string): Partial<ProductData> {
  const result: Partial<ProductData> = {}
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1])
      const items: unknown[] = Array.isArray(json) ? json : [json]
      for (const item of items) {
        const obj = item as Record<string, unknown>
        if (obj['@type'] !== 'Product') continue
        if (typeof obj.name === 'string' && !result.name) result.name = obj.name
        const img = obj.image
        if (!result.image_url) {
          if (typeof img === 'string') result.image_url = img
          else if (Array.isArray(img) && typeof img[0] === 'string') result.image_url = img[0]
          else if (img && typeof img === 'object' && 'url' in (img as object))
            result.image_url = (img as Record<string, string>).url
        }
        const offers = obj.offers as Record<string, unknown> | undefined
        if (offers && result.price == null) {
          const offerList = Array.isArray(offers) ? offers : [offers]
          const first = offerList[0] as Record<string, unknown>
          if (first?.price != null) {
            result.price = parseFloat(String(first.price))
            result.currency = typeof first.priceCurrency === 'string' ? first.priceCurrency : 'USD'
            result.in_stock = String(first.availability ?? '').toLowerCase().includes('instock')
          }
        }
      }
    } catch { /* skip */ }
  }
  return result
}

function extractMeta(html: string): Partial<ProductData> {
  const result: Partial<ProductData> = {}
  const og = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'))?.[1]
  const image = og('og:image')
  if (image) result.image_url = image
  const priceStr = og('product:price:amount') || og('og:price:amount')
  if (priceStr) result.price = parseFloat(priceStr)
  const curr = og('product:price:currency') || og('og:price:currency')
  if (curr) result.currency = curr
  const title = og('og:title')
  if (title) result.name = title.replace(/\s*[-|].*$/, '').trim()
  return result
}

async function extractWithLlm(html: string, url: string): Promise<Partial<ProductData>> {
  const trimmed = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 12000)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract product details from this HTML (URL: ${url}).
Return ONLY JSON: {"price":99.99,"original_price":129.99,"currency":"USD","in_stock":true,"name":"Product Name","image_url":"https://..."}
- price: current/sale price as number (required)
- original_price: crossed-out price or null
- currency: 3-letter ISO
- in_stock: true if purchasable
- name: product title or null
- image_url: main product image URL or null
HTML:\n${trimmed}`,
    }],
  })
  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
  } catch { /* ignore */ }
  return {}
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadStrategy(domain: string): Promise<SiteStrategy | null> {
  const { data } = await supabase
    .from('site_parsers')
    .select('selectors, needs_js')
    .eq('domain', domain)
    .single()
  if (!data?.selectors) return null
  const sel = data.selectors as Record<string, unknown>
  return {
    strategy: (sel.strategy as SiteStrategy['strategy']) ?? 'llm',
    needs_js: data.needs_js ?? false,
  }
}

async function saveStrategy(domain: string, strategy: SiteStrategy['strategy'], needsJs: boolean) {
  await supabase.from('site_parsers').upsert(
    { domain, selectors: { strategy }, needs_js: needsJs, last_verified: new Date().toISOString() },
    { onConflict: 'domain' },
  )
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { productId } = await req.json()
    if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 })

    const { data: product, error: fetchErr } = await supabase
      .from('products_with_price')
      .select('id, url, name, currency')
      .eq('id', productId)
      .single()

    if (fetchErr || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const domain    = new URL(product.url).hostname.replace('www.', '')
    const saved     = await loadStrategy(domain)
    const isNewSite = !saved
    const needsJs   = saved?.needs_js ?? false

    // Fetch HTML
    let html = await fetchPage(product.url, needsJs)

    // Extract using known or discovered strategy
    let data: Partial<ProductData> = {}
    let usedStrategy: SiteStrategy['strategy'] | null = null
    let usedJs = needsJs

    // Always try JSON-LD + OG first (fast, free)
    const structured = { ...extractMeta(html), ...extractJsonLd(html) }

    if (structured.price != null) {
      data = structured
      // Determine which source had the price
      usedStrategy = Object.keys(extractJsonLd(html)).includes('price') ? 'json_ld' : 'og_meta'
    }

    // No price → try JS render
    if (data.price == null && process.env.SCRAPER_API_KEY) {
      html   = await fetchPage(product.url, true)
      usedJs = true
      const rendered = { ...extractMeta(html), ...extractJsonLd(html) }
      if (rendered.price != null) {
        data = rendered
        usedStrategy = Object.keys(extractJsonLd(html)).includes('price') ? 'json_ld' : 'og_meta'
      }
    }

    // Still no price → LLM
    if (data.price == null) {
      const llm = await extractWithLlm(html, product.url)
      if (llm.price != null) {
        data = { ...data, ...llm }
        usedStrategy = 'llm'
      }
    }

    if (data.price == null) {
      return NextResponse.json({ error: 'Could not extract price from page' }, { status: 422 })
    }

    // Save strategy for new sites
    if (isNewSite && usedStrategy) {
      await saveStrategy(domain, usedStrategy, usedJs)
    }

    const currency = (data.currency || product.currency || 'USD').trim().slice(0, 3)
    const now = new Date().toISOString()

    await supabase.from('price_checks').insert({
      product_id:      product.id,
      price:           data.price,
      original_price:  data.original_price ?? null,
      currency,
      in_stock:        data.in_stock ?? true,
      checked_at:      now,
      parser_strategy: usedStrategy ?? 'unknown',
    })

    const updateFields: Record<string, unknown> = {
      current_price:  data.price,
      original_price: data.original_price ?? null,
      currency,
      in_stock:       data.in_stock ?? true,
      last_checked:   now,
    }
    if (data.name      && !product.name) updateFields.name      = data.name
    if (data.image_url)                  updateFields.image_url = data.image_url

    await supabase.from('products').update(updateFields).eq('id', product.id)

    return NextResponse.json({
      price:        data.price,
      currency,
      in_stock:     data.in_stock ?? true,
      name:         data.name ?? null,
      image_url:    data.image_url ?? null,
      site_learned: isNewSite && !!usedStrategy,
      strategy:     usedStrategy,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
