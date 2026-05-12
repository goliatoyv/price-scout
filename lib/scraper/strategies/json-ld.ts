import * as cheerio from 'cheerio'
import type { ProductData } from '../types'

function toNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d.,-]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function pickImage(img: unknown): string | null {
  if (typeof img === 'string') return img
  if (Array.isArray(img)) {
    const first = img.find(x => typeof x === 'string')
    if (first) return first as string
    const obj = img.find(x => x && typeof x === 'object' && 'url' in (x as object))
    if (obj) return (obj as { url?: string }).url ?? null
  }
  if (img && typeof img === 'object' && 'url' in (img as object)) {
    return (img as { url?: string }).url ?? null
  }
  return null
}

function availabilityToStock(v: unknown): boolean | null {
  if (v == null) return null
  const s = String(v).toLowerCase()
  if (s.includes('instock') || s.includes('in_stock'))   return true
  if (s.includes('outofstock') || s.includes('soldout')) return false
  return null
}

function typesOf(node: any): string[] {
  const t = node?.['@type']
  if (!t) return []
  return Array.isArray(t) ? t.map(String) : [String(t)]
}

function fromProduct(node: any): Partial<ProductData> | null {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
  if (!offers) return null

  const price = toNumber(offers.price ?? offers.lowPrice)
  if (price == null) return null

  const original = toNumber(
    node.highPrice ??
    offers.highPrice ??
    node.listPrice ??
    offers.listPrice ??
    offers.priceSpecification?.price
  )

  return {
    price,
    original_price: original != null && original > price ? original : null,
    currency: typeof offers.priceCurrency === 'string' ? offers.priceCurrency : null,
    in_stock: availabilityToStock(offers.availability),
    name: typeof node.name === 'string' ? node.name : null,
    image_url: pickImage(node.image),
  }
}

function walk(node: any): Partial<ProductData> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = walk(item)
      if (r) return r
    }
    return null
  }

  const types = typesOf(node)
  if (types.includes('Product')) {
    const r = fromProduct(node)
    if (r) return r
  }
  if (types.includes('ProductGroup') && Array.isArray(node.hasVariant)) {
    // Nike pattern — promote first variant's offer, keep group's name/image.
    for (const v of node.hasVariant) {
      const merged = {
        ...v,
        name: node.name ?? v?.name,
        image: node.image ?? v?.image,
      }
      const r = fromProduct(merged)
      if (r) return r
    }
  }
  if (node['@graph']) {
    const r = walk(node['@graph'])
    if (r) return r
  }
  return null
}

export function extractJsonLd(html: string): Partial<ProductData> | null {
  const $ = cheerio.load(html)
  const blocks = $('script[type="application/ld+json"]').toArray()
  for (const el of blocks) {
    const raw = $(el).contents().text().trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      const r = walk(parsed)
      if (r) return r
    } catch {
      // Some sites concatenate multiple JSON objects in one script.
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const r = walk(JSON.parse(match[0]))
          if (r) return r
        } catch { /* skip */ }
      }
    }
  }
  return null
}
