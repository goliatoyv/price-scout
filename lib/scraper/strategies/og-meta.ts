import * as cheerio from 'cheerio'
import type { ProductData } from '../types'

function num(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function extractOgMeta(html: string): Partial<ProductData> | null {
  const $ = cheerio.load(html)

  const meta = (key: string) =>
    $(`meta[property="${key}"]`).attr('content') ??
    $(`meta[name="${key}"]`).attr('content') ??
    $(`meta[itemprop="${key}"]`).attr('content') ??
    undefined

  const price = num(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price'))
  if (price == null) return null

  const availability = meta('product:availability') ?? meta('og:availability') ?? meta('availability')
  const in_stock = availability
    ? /instock|in stock|available/i.test(availability) ? true
      : /outofstock|out of stock|sold/i.test(availability) ? false
      : null
    : null

  return {
    price,
    original_price: null,
    currency: meta('product:price:currency') ?? meta('og:price:currency') ?? null,
    in_stock,
    // Keep title as-is — aggressive trimming on " - "/" | " breaks legitimate names.
    name: meta('og:title') ?? null,
    image_url: meta('og:image') ?? meta('og:image:url') ?? null,
  }
}
