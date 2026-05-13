import { fetchPage, canRender, type FetchMode } from './fetch'
import { extractJsonLd, type VariantFilter } from './strategies/json-ld'
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

function mergeStructured(html: string, filter: VariantFilter): { data: Partial<ProductData> | null; strategy: Strategy | null } {
  const jl = extractJsonLd(html, filter)
  const og = extractOgMeta(html)
  if (jl?.price != null) return { data: { ...og, ...jl }, strategy: 'json_ld' }
  if (og?.price != null) return { data: og, strategy: 'og_meta' }
  return { data: null, strategy: null }
}

async function safeFetch(url: string, mode: FetchMode): Promise<string | null> {
  try {
    const r = await fetchPage(url, mode)
    return r.html && r.html.length >= 500 ? r.html : null
  } catch (e) {
    console.error(`[scrape] fetch ${mode} failed`, e)
    return null
  }
}

/**
 * Adaptive product page extraction.
 *
 * Mode escalation ladder (each only fires if the previous step produced no
 * price). Stops at first success:
 *   1. direct   — plain HTTP, free.
 *   2. render   — ScraperAPI with JS rendering (~5 credits).
 *   3. premium  — ScraperAPI with premium proxies (~10 credits) — pierces
 *                 Akamai/Imperva (adidas, Nike SNKRS).
 *   4. LLM     — Claude Haiku reads the best HTML we have and returns JSON.
 *
 * Successful mode is persisted as site_parsers.{strategy, needs_js} so
 * future runs skip the cheaper-but-useless steps.
 */
export async function runPipeline(url: string, filter: VariantFilter = {}): Promise<PipelineOutcome> {
  const domain = domainOf(url)
  const saved  = await loadStrategy(domain)
  const hard   = isHardSite(url)

  // Decide where to START. If we've already learned the domain needs JS, or
  // it's a known hard host, skip the useless direct fetch.
  const startMode: FetchMode =
    !canRender()                  ? 'direct' :
    saved?.needs_js               ? 'render' :
    hard                          ? 'render' :
                                    'direct'

  let html = await safeFetch(url, startMode)
  if (!html) {
    // For 'render' start, fall back to direct so we have *something* for LLM.
    if (startMode !== 'direct') {
      html = await safeFetch(url, 'direct')
    }
    if (!html) throw new Error('Could not fetch product page')
  }

  let usedJs = startMode !== 'direct'
  let data: Partial<ProductData> | null = null
  let strategy: Strategy | null = null

  // Helper: try structured extract; if it fails AND cache says 'llm', try LLM.
  const tryExtract = async (currentHtml: string): Promise<boolean> => {
    const r = mergeStructured(currentHtml, filter)
    if (r.data && r.strategy) {
      data = r.data; strategy = r.strategy
      return true
    }
    if (saved?.strategy === 'llm') {
      const llm = await extractWithLlm(currentHtml, url)
      if (llm) { data = llm; strategy = 'llm'; return true }
    }
    return false
  }

  if (await tryExtract(html)) {
    // got it on first pass
  } else if (canRender() && !usedJs) {
    // Escalate to render
    const rendered = await safeFetch(url, 'render')
    if (rendered) {
      html = rendered; usedJs = true
      if (!(await tryExtract(html))) {
        // Try premium as the last paid step
        const premium = await safeFetch(url, 'premium')
        if (premium) {
          html = premium
          await tryExtract(html)
        }
      }
    }
  } else if (canRender() && usedJs) {
    // We started in render (hard-site / needs_js) and it didn't yield;
    // try premium as the next escalation.
    const premium = await safeFetch(url, 'premium')
    if (premium) {
      html = premium
      await tryExtract(html)
    }
  }

  // Final fallback: LLM on whatever HTML we have. Skip if we know cache=llm
  // and already tried it inside tryExtract.
  if (!data && saved?.strategy !== 'llm') {
    const llm = await extractWithLlm(html, url)
    if (llm) { data = llm; strategy = 'llm' }
  }

  if (!data || data.price == null || !strategy) {
    throw new Error('Could not extract price from page')
  }

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
