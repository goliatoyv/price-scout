'use client'
import { Product } from '@/lib/types'
import { QuickFilter } from '@/app/page'

interface Props {
  products: Product[]
  activeFilter: QuickFilter
  onFilter: (f: QuickFilter) => void
}

export function StatsBar({ products, activeFilter, onFilter }: Props) {
  const total       = products.length
  const belowTarget = products.filter(p =>
    p.current_price != null && p.target_price != null && p.current_price <= p.target_price
  ).length
  const checked24h  = products.filter(p => {
    if (!p.last_checked) return false
    return Date.now() - new Date(p.last_checked).getTime() < 86400000
  }).length
  const sites = new Set(products.map(p => p.site_domain).filter(Boolean)).size

  const cards: { label: string; value: number; color: string; filter: QuickFilter }[] = [
    { label: 'Всього позицій',    value: total,       color: 'text-gray-900',   filter: ''           },
    { label: 'Нижче цілі 🎯',    value: belowTarget, color: 'text-green-600',  filter: 'below_target' },
    { label: 'Перевірено 24г',   value: checked24h,  color: 'text-blue-600',   filter: 'checked_24h'  },
    { label: 'Сайтів',           value: sites,       color: 'text-purple-600', filter: ''           },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(c => {
        const isActive  = c.filter && activeFilter === c.filter
        const clickable = !!c.filter
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => clickable && onFilter(c.filter)}
            className={`bg-white rounded-2xl p-4 shadow-sm border text-left transition-all
              ${clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
              ${isActive
                ? 'border-blue-400 ring-2 ring-blue-200'
                : 'border-gray-100'}`}
          >
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
            {isActive && (
              <div className="text-xs text-blue-500 mt-1">фільтр активний · клік щоб скинути</div>
            )}
          </button>
        )
      })}
    </div>
  )
}
