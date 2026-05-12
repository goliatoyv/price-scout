import { supabaseAdmin } from '../supabase'
import type { SiteStrategy, Strategy } from './types'

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

export async function loadStrategy(domain: string): Promise<SiteStrategy | null> {
  const { data } = await supabaseAdmin
    .from('site_parsers')
    .select('selectors, needs_js')
    .eq('domain', domain)
    .maybeSingle()

  if (!data?.selectors) return null
  const sel = data.selectors as Record<string, unknown>
  const strategy = sel.strategy as Strategy | undefined
  if (strategy !== 'json_ld' && strategy !== 'og_meta' && strategy !== 'llm') return null
  return { strategy, needs_js: !!data.needs_js }
}

export async function saveStrategy(
  domain:   string,
  strategy: Strategy,
  needsJs:  boolean,
): Promise<void> {
  await supabaseAdmin.from('site_parsers').upsert(
    {
      domain,
      selectors:     { strategy },
      needs_js:      needsJs,
      last_verified: new Date().toISOString(),
    },
    { onConflict: 'domain' },
  )
}
