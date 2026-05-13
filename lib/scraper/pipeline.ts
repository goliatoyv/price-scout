import { fetchPage, canRender } from './fetch'
import { extractJsonLd } from './strategies/json-ld'
import { extractOgMeta } from './strategies/og-meta'
import { extractWithLlm } from './strategies/llm'
import { domainOf, loadStrategy, saveStrategy } from './cache'
import { isHardSite } from './hard-sites'
import type { ProductData, Strategy } from './types'

export interface PipelineOutcome {
  data:        Partial<ProductData>
  strategy:    Strategy
  usedJs:      boolean
  siteLearned: boolean
}

function mergeStructured(html: string): { data: Partial<ProductData> | null; strategy: Strategy | null } {
  const jl = extractJsonLd(html)
  const og = extractOgMeta(html)
  if (jl?.price != null) return { data: { ...og, ...jl }, strategy: 'json_ld' }
  if (og?.price != null) return { data: og, strategy: 'og_meta' }
  return { data: null, strategy: null }
}

export async function runPipeline(url: string): Promise<PipelineOutcome> {
  const domain = domainOf(url)
  const saved  = await loadStrategy(domain)
  const hard   = isHardSite(url)

  // Render only when we know it's needed: cached needs_js OR known-hard site.
  const initialRender = ((saved?.needs_js ?? false) || hard) && canRender()

  let outcome = await fetchPage(url, initialRender)
  let html    = outcome.html
  let usedJs  = outcome.rendered

  if (!html || html.length < 500) {
    throw new Error('Could not fetch product page')
  }

  let data: Partial<ProductData> | null = null
  let strategy: Strategy | null = null

  // 1. Cached strategy short-circuit.
  if (saved?.strategy === 'llm') {
    const r = await extractWithLlm(html, url)
    if (r) { data = r; strategy = 'llm' }
  } else if (saved?.strategy === 'og_meta') {
    const r = extractOgMeta(html)
    if (r?.price != null) { data = r; strategy = 'og_meta' }
  } else if (saved?.strategy === 'json_ld') {
    const r = extractJsonLd(html)
    if (r?.price != null) { data = { ...extractOgMeta(html), ...r }; strategy = 'json_ld' }
  }

  // 2. Cache miss / stale → full structured pass.
  if (!data) {
    const r = mergeStructured(html)
    if (r.data && r.strategy) { data = r.data; strategy = r.strategy }
  }

  // 3. No price → JS render retry only for hard sites (avoid burning credits
  //    on unknown domains where render likely won't help either).
  if (!data && !usedJs && hard && canRender()) {
    const rerender = await fetchPage(url, true)
    html    = rerender.html
    usedJs  = true
    const r = mergeStructured(html)
    if (r.data && r.strategy) { data = r.data; strategy = r.strategy }
  }

  // 4. LLM fallback on the (possibly direct) HTML — skip if cache routed us
  //    here already.
  if (!data && saved?.strategy !== 'llm') {
    const r = await extractWithLlm(html, url)
    if (r) { data = r; strategy = 'llm' }
  }

  // 5. Last-resort render retry: if everything failed and we have not yet
  //    rendered, try ScraperAPI once. On success the domain is auto-learned
  //    as needs_js=true so future runs go straight to render.
  if (!data && !usedJs && canRender()) {
    const rerender = await fetchPage(url, true)
    if (rerender.html && rerender.html.length >= 500) {
      html   = rerender.html
      usedJs = true
      const r = mergeStructured(html)
      if (r.data && r.strategy) {
        data = r.data; strategy = r.strategy
      } else {
        const llm = await extractWithLlm(html, url)
        if (llm) { data = llm; strategy = 'llm' }
      }
    }
  }

  if (!data || data.price == null || !strategy) {
    throw new Error('Could not extract price from page')
  }

  // Persist strategy only when it actually changed — avoid noisy writes.
  const changed =
    saved?.strategy !== strategy || (saved?.needs_js ?? false) !== usedJs
  if (changed) {
    await saveStrategy(domain, strategy, usedJs)
  }

  return {
    data,
    strategy,
    usedJs,
    siteLearned: !saved,
  }
}
