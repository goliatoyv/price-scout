import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
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

interface SiteSelectors {
  strategy:          'json_ld' | 'og_meta' | 'css'
  needs_js:          boolean
  price?:            string
  price_attr?:       string
  original_price?:   string
  name?:             string
  image?:            string
  image_attr?:       string
  currency?:         string
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

function extractWithSelectors(html: string, sel: SiteSelectors): Partial<ProductData> {
  const $ = cheerio.load(html)
  const result: Partial<ProductData> = {}

  function read(selector: string, attr?: string): string | null {
    const el = $(selector).first()
    if (!el.length) return null
    return attr ? (el.attr(attr) ?? null) : (el.text().trim() || null)
  }

  if (sel.price) {
    const raw = read(sel.price, sel.price_attr)
    if (raw) result.price = parseFloat(raw.replace(/[^0-9.]/g, ''))
  }
  if (sel.original_price) {
    const raw = read(sel.original_price)
    if (raw) result.original_price = parseFloat(raw.replace(/[^0-9.]/g, ''))
  }
  if (sel.name) {
    const v = read(sel.name)
    if (v) result.name = v
  }
  if (sel.image) {
    const v = read(sel.image, sel.image_attr || 'src')
    if (v) result.image_url = v
  }
  if (sel.currency) result.currency = sel.currency

  return result
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

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
Return ONLY JSON: {"price":99.99,"original_price":129.99,"currency":"USD","in_stock":true,"name":"...","image_url":"..."}
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

// ─── Learn selectors from successful extraction ───────────────────────────────

async function learnSelectors(
  html: string,
  url: string,
  extracted: ProductData,
  strategy: 'json_ld' | 'og_meta' | 'css',
): Promise<SiteSelectors | null> {
  // For JSON-LD / OG strategies we just record the strategy — no CSS needed
  if (strategy !== 'css') {
    return { strategy, needs_js: false }
  }

  // Ask Claude to generate CSS selectors that would extract the same data
  const trimmed = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 14000)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `We successfully extracted this product data from a page:
Price: ${extracted.price} ${extracted.currency}
Name: ${extracted.name ?? 'unknown'}
Image: ${extracted.image_url ?? 'none'}

Now generate CSS selectors that reliably extract these values from this HTML.
Return ONLY JSON (no explanation):
{
  "price": "CSS selector for price element",
  "price_attr": "attribute name if price is in an attribute, otherwise null",
  "original_price": "CSS selector for original/crossed-out price or null",
  "name": "CSS selector for product title or null",
  "image": "CSS selector for main product image or null",
  "image_attr": "attribute for image URL (usually 'src' or 'data-src')"
}

HTML:\n${trimmed}`,
    }],
  })

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const sel = JSON.parse(m[0])
    return { strategy: 'css', needs_js: false, currency: extracted.currency, ...sel }
  } catch { return null }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadParser(domain: string): Promise<SiteSelectors | null> {
  const { data } = await supabase
    .from('site_parsers')
    .select('selectors, needs_js')
    .eq('domain', domain)
    .single()
  if (!data?.selectors) return null
  return { ...(data.selectors as object), needs_js: data.needs_js ?? false } as SiteSelectors
}

async function saveParser(domain: string, sel: SiteSelectors, needsJs: boolean) {
  await supabase.from('site_parsers').upsert(
    { domain, selectors: sel, needs_js: needsJs, last_verified: new Date().toISOString() },
    { onConflict: 'domain' },
  )
}

async function markParserFailure(domain: string) {
  await supabase.rpc('increment_fail_streak', { p_domain: domain }).catch(() => {})
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { productId } = await req.json()
    if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 })

    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, url, name, currency')
      .eq('id', productId)
      .single()

    if (fetchErr || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const domain = new URL(product.url).hostname.replace('www.', '')

    // ── 1. Check for a saved parser ──────────────────────────────────────────
    const savedParser = await loadParser(domain)
    const isNewSite   = !savedParser

    // ── 2. Fetch HTML (with JS rendering if known to need it) ────────────────
    const needsRender = savedParser?.needs_js ?? false
    let html = await fetchPage(product.url, needsRender)

    // ── 3. Extract data ──────────────────────────────────────────────────────
    let data: Partial<ProductData> = {}
    let usedStrategy: 'json_ld' | 'og_meta' | 'css' | null = null
    let usedJs = needsRender

    if (savedParser) {
      // Known site: use cached strategy
      if (savedParser.strategy === 'json_ld') {
        data = { ...extractMeta(html), ...extractJsonLd(html) }
        usedStrategy = 'json_ld'
      } else if (savedParser.strategy === 'og_meta') {
        data = extractMeta(html)
        usedStrategy = 'og_meta'
      } else if (savedParser.strategy === 'css') {
        data = extractWithSelectors(html, savedParser)
        usedStrategy = 'css'
      }

      // If cached strategy failed, retry with JS render
      if (data.price == null && !needsRender && process.env.SCRAPER_API_KEY) {
        html   = await fetchPage(product.url, true)
        usedJs = true
        if (savedParser.strategy === 'json_ld')  data = { ...extractMeta(html), ...extractJsonLd(html) }
        if (savedParser.strategy === 'og_meta')  data = extractMeta(html)
        if (savedParser.strategy === 'css')      data = extractWithSelectors(html, savedParser)
      }

      if (data.price == null) await markParserFailure(domain)
    } else {
      // New site: full discovery pipeline
      data = { ...extractMeta(html), ...extractJsonLd(html) }
      if (data.price != null) {
        usedStrategy = Object.keys(extractJsonLd(html)).includes('price') ? 'json_ld' : 'og_meta'
      }

      // No price yet → try JS render
      if (data.price == null && process.env.SCRAPER_API_KEY) {
        html   = await fetchPage(product.url, true)
        usedJs = true
        const rendered = { ...extractMeta(html), ...extractJsonLd(html) }
        if (rendered.price != null) {
          data = rendered
          usedStrategy = Object.keys(extractJsonLd(html)).includes('price') ? 'json_ld' : 'og_meta'
        }
      }

      // Still nothing → LLM
      if (data.price == null) {
        const llm = await extractWithLlm(html, product.url)
        if (llm.price != null) {
          data = { ...data, ...llm }
          usedStrategy = 'css'  // will generate CSS selectors below
        }
      }
    }

    if (data.price == null) {
      return NextResponse.json({ error: 'Could not extract price from page' }, { status: 422 })
    }

    const extracted = data as ProductData

    // ── 4. Learn and save parser for new sites ───────────────────────────────
    if (isNewSite && usedStrategy) {
      const learned = await learnSelectors(html, product.url, extracted, usedStrategy)
      if (learned) await saveParser(domain, learned, usedJs)
    }

    // ── 5. Update DB ─────────────────────────────────────────────────────────
    const currency = extracted.currency || product.currency || 'USD'
    const now = new Date().toISOString()

    await supabase.from('price_checks').insert({
      product_id:      product.id,
      price:           extracted.price,
      original_price:  extracted.original_price ?? null,
      currency,
      in_stock:        extracted.in_stock ?? true,
      checked_at:      now,
      parser_strategy: usedStrategy ?? 'unknown',
    })

    const updateFields: Record<string, unknown> = {
      current_price:  extracted.price,
      original_price: extracted.original_price ?? null,
      currency,
      in_stock:       extracted.in_stock ?? true,
      last_checked:   now,
    }
    if (extracted.name      && !product.name) updateFields.name      = extracted.name
    if (extracted.image_url)                  updateFields.image_url = extracted.image_url

    await supabase.from('products').update(updateFields).eq('id', product.id)

    return NextResponse.json({
      price:       extracted.price,
      currency,
      in_stock:    extracted.in_stock ?? true,
      name:        extracted.name ?? null,
      image_url:   extracted.image_url ?? null,
      site_learned: isNewSite && !!usedStrategy,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
