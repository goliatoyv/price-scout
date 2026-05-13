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

async function rawFetch(url: string, render: boolean): Promise<FetchOutcome> {
  const key = process.env.SCRAPER_API_KEY
  let target: string

  if (key) {
    const params = new URLSearchParams({ api_key: key, url })
    if (render) params.set('render', 'true')
    target = `https://api.scraperapi.com/?${params.toString()}`
  } else {
    // Direct fetch — validate URL to avoid SSRF.
    assertSafeUrl(url)
    target = url
  }

  const res = await fetch(target, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(render ? TIMEOUT_RENDER_MS : TIMEOUT_DIRECT_MS),
  })
  const html = await res.text()
  return { html, status: res.status, rendered: render }
}

/**
 * Single fetch with the requested render mode. No automatic upgrade — the
 * caller decides whether to retry. This keeps ScraperAPI usage explicit so
 * we don't burn render credits on every blocked page.
 */
export async function fetchPage(url: string, render = false): Promise<FetchOutcome> {
  return rawFetch(url, render)
}

export function canRender(): boolean {
  return !!process.env.SCRAPER_API_KEY
}
