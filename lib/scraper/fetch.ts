import { assertSafeUrl } from './safe-url'

const TIMEOUT_MS = 40_000
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const html = await res.text()
  return { html, status: res.status, rendered: render }
}

/**
 * Fetch with auto-retry on JS render when the first response looks blocked
 * (status 403 or HTML shorter than 500 bytes). The retry only happens if a
 * ScraperAPI key is available — otherwise rendering is impossible.
 */
export async function fetchPage(url: string, render = false): Promise<FetchOutcome> {
  const first = await rawFetch(url, render)
  const blocked = first.status === 403 || first.html.length < 500
  if (blocked && !render && process.env.SCRAPER_API_KEY) {
    return rawFetch(url, true)
  }
  return first
}
