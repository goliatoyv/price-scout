import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { products } = await req.json()
  if (!Array.isArray(products) || products.length === 0)
    return NextResponse.json({ error: 'Список порожній' }, { status: 400 })

  const rows = products.map((p: { url: string; name?: string; target_price?: number; size?: string }) => {
    let domain = ''
    try { domain = new URL(p.url).hostname.replace('www.', '') } catch {}
    return {
      url:          p.url,
      name:         p.name || null,
      site_domain:  domain,
      target_price: p.target_price || null,
      size:         p.size || null,
      status:       'watching' as const,
      priority:     1,
    }
  })

  const { data, error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ added: data?.length ?? 0 })
}
