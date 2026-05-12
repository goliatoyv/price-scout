import { fetchPage } from './fetch'
import { extractJsonLd } from './strategies/json-ld'
import { extractOgMeta } from './strategies/og-meta'
import { extractWithLlm } from './strategies/llm'
import { domainOf, loadStrategy, saveStrategy } from './cache'
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

  // Initial fetch — honour cached needs_js so SPAs render on the first hop.
  let outcome = await fetchPage(url, saved?.needs_js ?? false)
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

  // 3. No price → JS render retry if not done yet.
  if (!data && !usedJs && process.env.SCRAPER_API_KEY) {
    const rerender = await fetchPage(url, true)
    html    = rerender.html
    usedJs  = true
    const r = mergeStructured(html)
    if (r.data && r.strategy) { data = r.data; strategy = r.strategy }
  }

  // 4. Final fallback → LLM (skip if cache already routed us here).
  if (!data && saved?.strategy !== 'llm') {
    const r = await extractWithLlm(html, url)
    if (r) { data = r; strategy = 'llm' }
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
