import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface InItem {
  color?:        string | null
  size?:         string | null
  target_price?: number | null
  name?:         string | null
  image_url?:    string | null
  url?:          string | null  // optional per-variant URL; falls back to baseUrl
}

interface InBody {
  baseUrl:   string
  groupKey?: string
  items:     InItem[]
}

export async function POST(req: Request) {
  let body: InBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Невірний JSON' }, { status: 400 })
  }
  if (!body?.baseUrl || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'baseUrl та items обовʼязкові' }, { status: 400 })
  }

  let domain = ''
  try { domain = new URL(body.baseUrl).hostname.replace(/^www\./, '') } catch {}

  const groupKey = body.groupKey || body.baseUrl

  const rows = body.items.map(it => ({
    url:           it.url || body.baseUrl,
    name:          it.name ?? null,
    image_url:     it.image_url ?? null,
    target_price:  it.target_price ?? null,
    color:         it.color ?? null,
    size:          it.size ?? null,
    site_domain:   domain,
    group_key:     groupKey,
    status:        'watching' as const,
    priority:      1,
  }))

  const { data, error } = await supabase
    .from('products')
    .insert(rows)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ids: (data ?? []).map(r => r.id) })
}
