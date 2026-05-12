'use client'
import { Product } from '@/lib/types'

export function StatsBar({ products }: { products: Product[] }) {
  const total     = products.length
  const belowTarget = products.filter(p => p.current_price != null && p.target_price != null && p.current_price <= p.target_price).length
  const dropped24h  = products.filter(p => {
    if (!p.last_checked) return false
    const age = Date.now() - new Date(p.last_checked).getTime()
    return age < 86400000 && p.current_price != null
  }).length
  const sites = new Set(products.map(p => p.site_domain).filter(Boolean)).size

  const cards = [
    { label: 'Total items',      value: total,        color: 'text-gray-900' },
    { label: 'Below target 🎯',  value: belowTarget,  color: 'text-green-600' },
    { label: 'Checked 24h',      value: dropped24h,   color: 'text-blue-600' },
    { label: 'Sites tracked',    value: sites,        color: 'text-purple-600' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-sm text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
