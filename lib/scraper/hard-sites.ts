// Domains that ship empty SPA shells — JSON-LD/OG never present in the
// initial HTML, so JS rendering is mandatory. ScraperAPI is reserved for
// these hosts plus any domain where we have already learned needs_js=true.
const HARD_SITES = [
  'adidas.com', 'adidas.de', 'adidas.co.uk',
  'zalando.de', 'zalando.com',
] as const

export function isHardSite(rawUrl: string): boolean {
  let host: string
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return false
  }
  return HARD_SITES.some(d => host === d || host.endsWith('.' + d))
}
