import { NextResponse } from 'next/server'
import { fetchPage, canRender } from '@/lib/scraper/fetch'
import { isHardSite } from '@/lib/scraper/hard-sites'
import { discoverVariants } from '@/lib/scraper/variants'

export const dynamic     = 'force-dynamic'
export const maxDuration = 90

export async function POST(req: Request) {
  let url: string | undefined
  try {
    const body = await req.json()
    url = body?.url
  } catch {
    return NextResponse.json({ error: 'Невірний JSON' }, { status: 400 })
  }
  if (!url) return NextResponse.json({ error: 'URL обовʼязковий' }, { status: 400 })

  // Try direct first; escalate to render only if needed or for hard hosts.
  const startRender = isHardSite(url) && canRender()
  let html = ''
  try {
    const first = await fetchPage(url, startRender ? 'render' : 'direct')
    html = first.html
  } catch (e) {
    console.error('[scrape/variants] direct fetch failed', e)
  }

  let result = html ? discoverVariants(html) : { groupName: null, groupImage: null, variants: [] }

  // No variants found → try render for non-hard sites too.
  if (result.variants.length === 0 && canRender() && !startRender) {
    try {
      const rerender = await fetchPage(url, 'render')
      if (rerender.html && rerender.html.length >= 500) {
        result = discoverVariants(rerender.html)
      }
    } catch (e) {
      console.error('[scrape/variants] render fetch failed', e)
    }
  }

  // Still nothing → premium as a last resort (Akamai sites).
  if (result.variants.length === 0 && canRender()) {
    try {
      const premium = await fetchPage(url, 'premium')
      if (premium.html && premium.html.length >= 500) {
        result = discoverVariants(premium.html)
      }
    } catch (e) {
      console.error('[scrape/variants] premium fetch failed', e)
    }
  }

  return NextResponse.json(result)
}
