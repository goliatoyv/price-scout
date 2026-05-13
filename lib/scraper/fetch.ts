import { assertSafeUrl } from './safe-url'

// Direct fetches are fast; ScraperAPI render of heavy SPAs (Nike Launch,
// Adidas product pages) can run 20-50s. Vercel functions cap at 60s.
const TIMEOUT_DIRECT_MS = 15_000
const TIMEOUT_RENDER_MS = 55_000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

export interface FetchOutcome {
  html:    string
  status:  number
  rendered: boolean
}

export type FetchMode = 'direct' | 'render' | 'premium'

async function rawFetch(url: string, mode: FetchMode): Promise<FetchOutcome> {
  const key = process.env.SCRAPER_API_KEY
  let target: string
  let timeout = TIMEOUT_DIRECT_MS

  if (mode !== 'direct' && key) {
    const params = new URLSearchParams({ api_key: key, url, render: 'true' })
    if (mode === 'premium') params.set('premium', 'true')
    target = `https://api.scraperapi.com/?${params.toString()}`
    timeout = TIMEOUT_RENDER_MS
  } else {
    // Direct fetch — validate URL to avoid SSRF.
    assertSafeUrl(url)
    target = url
  }

  const res = await fetch(target, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeout),
  })
  const html = await res.text()
  return { html, status: res.status, rendered: mode !== 'direct' }
}

/**
 * Single fetch with the requested mode:
 *   'direct'  — plain HTTP, no proxy (free).
 *   'render'  — ScraperAPI with JS rendering (~5 credits).
 *   'premium' — ScraperAPI with JS + premium proxies (~10 credits) for
 *               Akamai/Imperva-protected hosts like adidas, Nike SNKRS.
 * The caller decides when to escalate.
 */
export async function fetchPage(url: string, mode: FetchMode = 'direct'): Promise<FetchOutcome> {
  return rawFetch(url, mode)
}

export function canRender(): boolean {
  return !!process.env.SCRAPER_API_KEY
}
