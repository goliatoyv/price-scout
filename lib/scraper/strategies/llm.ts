import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import type { ProductData } from '../types'

const MODEL    = 'claude-haiku-4-5-20251001'
const MAX_HTML = 12_000
const TIMEOUT  = 30_000

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TIMEOUT,
    })
  }
  return client
}

function prepareHtml(html: string): string {
  const $ = cheerio.load(html)
  // Drop noise that wastes the 12k window.
  $('script, style, noscript, svg, iframe, link, meta[name="viewport"]').remove()
  // Keep head (has og: tags as fallback signal) + visible body text-ish HTML.
  const head = $('head').html() ?? ''
  const body = $('body').html() ?? ''
  return `<head>${head}</head><body>${body}</body>`
    .replace(/\s+/g, ' ')
    .slice(0, MAX_HTML)
}

export async function extractWithLlm(html: string, url: string): Promise<Partial<ProductData> | null> {
  const c = getClient()
  if (!c) return null

  const cleaned = prepareHtml(html)
  const prompt = `Extract product details from this HTML (URL: ${url}).
Return ONLY one JSON object, no markdown, no commentary:
{"price":99.99,"original_price":129.99,"currency":"USD","in_stock":true,"name":"Product Name","image_url":"https://..."}
- price: current/sale price as number (required, otherwise return {"price": null})
- original_price: crossed-out / list price, else null
- currency: 3-letter ISO, else null
- in_stock: true if purchasable, false if sold out, null if unknown
- name: product title or null
- image_url: main product image absolute URL or null

HTML:
${cleaned}`

  let text = ''
  try {
    const msg = await c.messages.create({
      model:      MODEL,
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })
    text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
  } catch (e) {
    console.error('[scrape] LLM extract failed', e)
    return null
  }

  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[0])
    if (typeof parsed.price !== 'number' || !Number.isFinite(parsed.price)) return null
    return {
      price:          parsed.price,
      original_price: typeof parsed.original_price === 'number' ? parsed.original_price : null,
      currency:       typeof parsed.currency === 'string' ? parsed.currency : null,
      in_stock:       typeof parsed.in_stock === 'boolean' ? parsed.in_stock : null,
      name:           typeof parsed.name === 'string' ? parsed.name : null,
      image_url:      typeof parsed.image_url === 'string' ? parsed.image_url : null,
    }
  } catch {
    return null
  }
}
