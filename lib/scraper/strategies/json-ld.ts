import * as cheerio from 'cheerio'
import type { ProductData } from '../types'

export interface VariantFilter {
  color?: string | null
  size?:  string | null
}

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

// ─── Variant matching ────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Schema.org variants put colour/size in various places. Pull them all into
// a single searchable haystack per variant.
function variantText(v: any): string {
  if (!v || typeof v !== 'object') return ''
  const parts: string[] = []
  for (const k of ['color', 'colour', 'size', 'name', 'description', 'sku', 'mpn', 'gtin']) {
    if (typeof v[k] === 'string') parts.push(v[k])
  }
  // additionalProperty / additionalType — often: [{name:"Color", value:"Grey Matter"}]
  const ap = v.additionalProperty
  if (Array.isArray(ap)) {
    for (const p of ap) {
      if (p && typeof p === 'object') {
        const name  = typeof p.name  === 'string' ? p.name  : ''
        const value = typeof p.value === 'string' ? p.value : ''
        parts.push(`${name}: ${value}`)
      }
    }
  }
  return normalize(parts.join(' | '))
}

function variantMatchesFilter(v: any, filter: VariantFilter): boolean {
  const text = variantText(v)
  if (filter.color) {
    if (!text.includes(normalize(filter.color))) return false
  }
  if (filter.size) {
    if (!text.includes(normalize(filter.size))) return false
  }
  return true
}

function priceOf(node: any): number | null {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
  if (!offers) return null
  return toNumber(offers.price ?? offers.lowPrice)
}

function pickVariant(group: any, filter: VariantFilter): any | null {
  const variants = group.hasVariant
  if (!Array.isArray(variants) || variants.length === 0) return null

  const hasFilter = !!(filter.color || filter.size)

  if (hasFilter) {
    // Find a variant matching ALL specified filter fields. Prefer exact/contains
    // match; if multiple match, prefer the cheapest one.
    const matches = variants.filter(v => variantMatchesFilter(v, filter))
    if (matches.length > 0) {
      matches.sort((a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity))
      return matches[0]
    }
  }

  // No filter, or nothing matched → fall back to the cheapest variant with a
  // price (better default than the first listed).
  const priced = variants
    .map(v => ({ v, p: priceOf(v) }))
    .filter(x => x.p != null)
  if (priced.length === 0) return variants[0]
  priced.sort((a, b) => (a.p as number) - (b.p as number))
  return priced[0].v
}

// ─── Recursive JSON-LD walker ────────────────────────────────────────────────

function walk(node: any, filter: VariantFilter): Partial<ProductData> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = walk(item, filter)
      if (r) return r
    }
    return null
  }

  const types = typesOf(node)
  if (types.includes('Product')) {
    const r = fromProduct(node)
    if (r) return r
  }
  if (types.includes('ProductGroup')) {
    const chosen = pickVariant(node, filter)
    if (chosen) {
      const merged = {
        ...chosen,
        name:  node.name  ?? chosen.name,
        image: node.image ?? chosen.image,
      }
      const r = fromProduct(merged)
      if (r) return r
    }
  }
  if (node['@graph']) {
    const r = walk(node['@graph'], filter)
    if (r) return r
  }
  return null
}

export function extractJsonLd(html: string, filter: VariantFilter = {}): Partial<ProductData> | null {
  const $ = cheerio.load(html)
  const blocks = $('script[type="application/ld+json"]').toArray()
  for (const el of blocks) {
    const raw = $(el).contents().text().trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      const r = walk(parsed, filter)
      if (r) return r
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const r = walk(JSON.parse(match[0]), filter)
          if (r) return r
        } catch { /* skip */ }
      }
    }
  }
  return null
}
