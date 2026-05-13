import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { runPipeline } from '@/lib/scraper/pipeline'

export const dynamic     = 'force-dynamic'
// Render-heavy SPAs (Nike Launch, Adidas) can take 30-50s in ScraperAPI; we
// need headroom for an optional LLM follow-up call after render. Requires
// Vercel Pro plan; on Hobby this silently caps at 60s.
export const maxDuration = 90

interface ProductRow {
  id:        string
  url:       string
  name:      string | null
  image_url: string | null
  currency:  string | null
  color:     string | null
  size:      string | null
}

function unauthorized(req: Request): boolean {
  const required = process.env.SCRAPE_AUTH_TOKEN
  if (!required) return false  // auth disabled if env var not set
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return got !== required
}

export async function POST(req: Request) {
  if (unauthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let productId: string | undefined
  try {
    const body = await req.json()
    productId = body?.productId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 })
  }

  // Read via RLS-safe view (anon).
  const { data: product, error: readErr } = await supabase
    .from('products_with_price')
    .select('id, url, name, image_url, currency, color, size')
    .eq('id', productId)
    .maybeSingle<ProductRow>()

  if (readErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  let outcome
  try {
    outcome = await runPipeline(product.url, { color: product.color, size: product.size })
  } catch (e) {
    console.error('[scrape] pipeline failed', { productId, url: product.url, error: e })
    const msg = e instanceof Error ? e.message : 'scrape failed'
    // Surface only safe, expected messages — anything else is internal.
    const safe =
      msg === 'Could not fetch product page' ||
      msg === 'Could not extract price from page' ||
      msg === 'Invalid URL' ||
      msg === 'Only http(s) URLs are allowed' ||
      msg === 'Internal hosts are not allowed'
        ? msg
        : 'Scrape failed'
    return NextResponse.json({ error: safe }, { status: 502 })
  }

  const { data, strategy, usedJs, siteLearned } = outcome
  const currency = (data.currency || product.currency || 'USD').trim().slice(0, 3)
  const now = new Date().toISOString()

  // Insert price history — preserve null for unknown in_stock instead of defaulting to true.
  const { error: insErr } = await supabaseAdmin.from('price_checks').insert({
    product_id:      product.id,
    price:           data.price,
    original_price:  data.original_price ?? null,
    currency,
    in_stock:        data.in_stock ?? null,
    checked_at:      now,
    parser_strategy: strategy,
  })
  if (insErr) {
    console.error('[scrape] price_checks insert failed', insErr)
    return NextResponse.json({ error: 'Persist failed' }, { status: 500 })
  }

  // products_with_price view derives price/currency/in_stock/last_checked from the
  // latest price_checks row, so we only mutate products for metadata fields.
  const updateFields: Record<string, unknown> = {}
  if (data.name      && !product.name)      updateFields.name      = data.name
  if (data.image_url && !product.image_url) updateFields.image_url = data.image_url

  if (Object.keys(updateFields).length > 0) {
    const { error: updErr } = await supabaseAdmin
      .from('products')
      .update(updateFields)
      .eq('id', product.id)
    if (updErr) {
      console.error('[scrape] products update failed', updErr)
      return NextResponse.json({ error: 'Persist failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    price:        data.price,
    currency,
    in_stock:     data.in_stock ?? null,
    name:         data.name ?? null,
    image_url:    data.image_url ?? null,
    strategy,
    rendered:     usedJs,
    site_learned: siteLearned,
  })
}
