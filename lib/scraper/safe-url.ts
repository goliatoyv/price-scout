// Block SSRF when SCRAPER_API_KEY is absent and we fetch the target URL directly.
// We reject non-http(s) schemes and obvious internal hosts. This is best-effort —
// for a hardened setup, route all egress through ScraperAPI or a proxy that
// resolves DNS and applies an allow-list.

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|fc00:|fe80:)/i

export function assertSafeUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  if (PRIVATE_HOST.test(u.hostname)) {
    throw new Error('Internal hosts are not allowed')
  }
  return u
}
