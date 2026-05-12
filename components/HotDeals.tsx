'use client'
import { Product } from '@/lib/types'
import { fmt } from '@/lib/utils'

export function HotDeals({ products }: { products: Product[] }) {
  const hot = products.filter(p =>
    p.current_price != null && p.target_price != null && p.current_price <= p.target_price
  )
  if (hot.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">🔥 Гарячі пропозиції</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {hot.map(p => {
          const pct = p.target_price && p.current_price
            ? Math.round(((p.target_price - p.current_price) / p.target_price) * 100)
            : 0
          return (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
               className="flex-shrink-0 bg-white rounded-2xl shadow-sm border border-green-200 p-4 w-52 hover:shadow-md transition-shadow">
              {p.image_url && (
                <img src={p.image_url} alt="" className="w-full h-28 object-contain rounded-lg mb-2" />
              )}
              <div className="text-sm font-medium line-clamp-2 mb-2">{p.name || p.url}</div>
              <div className="text-xl font-bold text-green-600">{fmt(p.current_price, p.currency || 'USD')}</div>
              <div className="text-xs text-gray-400 line-through">{fmt(p.target_price)}</div>
              <div className="text-xs text-green-500 mt-1">{pct > 0 ? `${pct}% нижче цілі` : 'На рівні цілі'}</div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
