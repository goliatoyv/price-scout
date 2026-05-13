import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('products_with_price')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const body = await req.json()
  let domain = ''
  try { domain = new URL(body.url).hostname.replace('www.', '') } catch {}
  const { data, error } = await supabase
    .from('products')
    .insert({
      url: body.url,
      target_price: body.target_price || null,
      size: body.size || null,
      color: body.color || null,
      notes: body.notes || null,
      priority: body.priority || 1,
      site_domain: domain,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
