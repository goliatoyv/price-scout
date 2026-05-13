import * as cheerio from 'cheerio'

export interface DiscoveredVariant {
  color:          string | null
  size:           string | null
  price:          number | null
  original_price: number | null
  currency:       string | null
  in_stock:       boolean | null
  image_url:      string | null
  sku:            string | null
  name:           string | null
  // Per-variant URL if JSON-LD exposes one; otherwise null and the parent URL
  // is used for all variants.
  url:            string | null
}

export interface DiscoveryResult {
  groupName: string | null
  groupImage: string | null
  variants:  DiscoveredVariant[]
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

function attrFromAdditionalProperty(v: any, target: string): string | null {
  const ap = v?.additionalProperty
  if (!Array.isArray(ap)) return null
  const want = target.toLowerCase()
  for (const p of ap) {
    if (p && typeof p === 'object') {
      const name = String(p.name ?? '').toLowerCase()
      if (name === want && typeof p.value === 'string') return p.value
    }
  }
  return null
}

function variantFrom(v: any, parent: any): DiscoveredVariant | null {
  const offers = Array.isArray(v.offers) ? v.offers[0] : v.offers
  const price = toNumber(offers?.price ?? offers?.lowPrice)

  const color =
    (typeof v.color   === 'string' ? v.color   : null) ??
    (typeof v.colour  === 'string' ? v.colour  : null) ??
    attrFromAdditionalProperty(v, 'color') ??
    attrFromAdditionalProperty(v, 'colour')

  const size =
    (typeof v.size === 'string' ? v.size : null) ??
    attrFromAdditionalProperty(v, 'size')

  const url = typeof v.url === 'string' ? v.url : (typeof v['@id'] === 'string' ? v['@id'] : null)
  const image = pickImage(v.image) ?? pickImage(parent?.image)
  const name  = (typeof v.name === 'string' ? v.name : null) ?? (typeof parent?.name === 'string' ? parent.name : null)

  return {
    color,
    size,
    price,
    original_price: toNumber(
      v.highPrice ?? offers?.highPrice ?? v.listPrice ?? offers?.listPrice ?? offers?.priceSpecification?.price
    ),
    currency: typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : null,
    in_stock: availabilityToStock(offers?.availability),
    image_url: image,
    sku: typeof v.sku === 'string' ? v.sku : (typeof v.mpn === 'string' ? v.mpn : null),
    name,
    url,
  }
}

function walk(node: any, acc: DiscoveredVariant[], group: { name: string | null; image: string | null }): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, acc, group)
    return
  }

  const types = typesOf(node)

  if (types.includes('ProductGroup')) {
    if (!group.name && typeof node.name === 'string') group.name = node.name
    if (!group.image) group.image = pickImage(node.image)
    const variants = node.hasVariant
    if (Array.isArray(variants)) {
      for (const v of variants) {
        if (v && typeof v === 'object') {
          const dv = variantFrom(v, node)
          if (dv) acc.push(dv)
        }
      }
    }
  } else if (types.includes('Product') && !types.includes('ProductGroup')) {
    // Standalone product — also expose as a single variant so the UI can
    // still render it (caller treats single-variant result as "no choice").
    const dv = variantFrom(node, node)
    if (dv) acc.push(dv)
    if (!group.name && typeof node.name === 'string') group.name = node.name
    if (!group.image) group.image = pickImage(node.image)
  }
  if (node['@graph']) walk(node['@graph'], acc, group)
}

export function discoverVariants(html: string): DiscoveryResult {
  const $ = cheerio.load(html)
  const acc: DiscoveredVariant[] = []
  const group = { name: null as string | null, image: null as string | null }

  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text().trim()
    if (!raw) continue
    try {
      walk(JSON.parse(raw), acc, group)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (m) {
        try { walk(JSON.parse(m[0]), acc, group) } catch { /* skip */ }
      }
    }
  }

  // Dedupe by (color, size, sku) — sites often repeat variants across multiple
  // ld+json blocks.
  const seen = new Set<string>()
  const unique = acc.filter(v => {
    const key = `${v.color ?? ''}|${v.size ?? ''}|${v.sku ?? ''}|${v.url ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { groupName: group.name, groupImage: group.image, variants: unique }
}
