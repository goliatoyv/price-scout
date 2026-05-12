export function fmt(n: number | null | undefined, currency = 'USD') {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

export function pctToTarget(current: number | null, target: number | null): number | null {
  if (!current || !target) return null
  return Math.round(((current - target) / target) * 100)
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function trendIcon(current: number | null, prev: number | null): string {
  if (!current || !prev) return ''
  if (current < prev) return '↓'
  if (current > prev) return '↑'
  return '→'
}
