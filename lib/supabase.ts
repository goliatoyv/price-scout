import { createClient } from '@supabase/supabase-js'

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

// Anon client — RLS-aware reads (used by browser-facing routes).
export const supabase = createClient(url, anon, {
  auth: { persistSession: false },
})

// Server-only admin client — bypasses RLS for trusted writes (scrape, cron).
// Falls back to anon if service key is not set; this means writes will obey
// RLS and may fail, which is intentional during local setup.
export const supabaseAdmin = createClient(url, service ?? anon, {
  auth: { persistSession: false },
})
