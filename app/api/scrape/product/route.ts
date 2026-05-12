import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

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
    const { productId } = await req.json()
    if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 })

    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, url, name, currency')
      .eq('id', productId)
      .single()

    if (fetchErr || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const html = await fetchPage(product.url)

    // Extract image tags and og:image for LLM context
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] || null

    const trimmed = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, 12000)

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 768,
      messages: [{
        role: 'user',
        content: `Extract product details from this HTML page (URL: ${product.url}).
${ogImage ? `The og:image meta tag value is: ${ogImage}` : ''}

Return ONLY a JSON object, no explanation:
{"price": 99.99, "original_price": 129.99, "currency": "USD", "in_stock": true, "name": "Product Name", "image_url": "https://..."}

Rules:
- price: current/sale price as number (required)
- original_price: crossed-out/was price as number, or null
- currency: 3-letter code (USD, EUR, GBP, etc.)
- in_stock: true if can be added to cart / available
- name: full product name, or null if not found
- image_url: main product image URL (prefer og:image if provided, else largest product image src), or null

HTML:
${trimmed}`,
      }],
    })

    let parsed: {
      price: number
      original_price?: number | null
      currency?: string
      in_stock?: boolean
      name?: string | null
      image_url?: string | null
    } | null = null

    try {
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'Failed to parse LLM response' }, { status: 500 })
    }

    if (!parsed || typeof parsed.price !== 'number') {
      return NextResponse.json({ error: 'Could not extract price from page' }, { status: 422 })
    }

    const currency = parsed.currency || product.currency || 'USD'
    const now = new Date().toISOString()

    await supabase.from('price_checks').insert({
      product_id: product.id,
      price: parsed.price,
      original_price: parsed.original_price ?? null,
      currency,
      in_stock: parsed.in_stock ?? true,
      checked_at: now,
      parser_strategy: 'llm_adhoc',
    })

    const updateFields: Record<string, unknown> = {
      current_price: parsed.price,
      original_price: parsed.original_price ?? null,
      currency,
      in_stock: parsed.in_stock ?? true,
      last_checked: now,
    }
    if (parsed.name && !product.name) updateFields.name = parsed.name
    if (parsed.image_url) updateFields.image_url = parsed.image_url
    else if (ogImage) updateFields.image_url = ogImage

    await supabase.from('products').update(updateFields).eq('id', product.id)

    return NextResponse.json({
      price: parsed.price,
      currency,
      in_stock: parsed.in_stock ?? true,
      name: parsed.name ?? null,
      image_url: updateFields.image_url ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
