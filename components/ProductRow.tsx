'use client'
import { useState } from 'react'
import { Trash2, ExternalLink } from 'lucide-react'
import { Product, ProductStatus, STATUS_META, ALL_STATUSES } from '@/lib/types'
import { fmt, pctToTarget, timeAgo } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { PriceSparkline } from './PriceSparkline'

interface Props { product: Product; onUpdate: () => void }

export function ProductRow({ product: p, onUpdate }: Props) {
  const [status, setStatus] = useState<ProductStatus>(p.status)

  async function updateStatus(s: ProductStatus) {
    setStatus(s)
    await fetch(`/api/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
    onUpdate()
  }

  async function deleteProduct() {
    if (!confirm('Видалити цей товар?')) return
    await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
    onUpdate()
  }

  const pct    = pctToTarget(p.current_price, p.target_price)
  const isHot  = pct != null && pct <= 0
  const currency = p.currency || 'USD'

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isHot ? 'bg-green-50/30' : ''}`}>
      {/* Image */}
      <td className="py-3 pl-4 pr-2">
        {p.image_url
          ? <img src={p.image_url} alt="" className="w-12 h-12 object-contain rounded-lg" />
          : <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-lg">👟</div>
        }
      </td>

      {/* Name + domain */}
      <td className="py-3 px-2 max-w-[220px]">
        <div className="font-medium text-sm line-clamp-2">{p.name || '—'}</div>
        <div className="text-xs text-gray-400 mt-0.5">{p.site_domain}</div>
        {p.size && <div className="text-xs text-gray-500 mt-0.5">Розмір: {p.size}</div>}
        {p.priority === 3 && <span className="text-xs">🔥</span>}
      </td>

      {/* Current price */}
      <td className="py-3 px-2 text-right">
        <div className={`font-bold text-sm ${isHot ? 'text-green-600' : ''}`}>
          {fmt(p.current_price, currency)}
        </div>
        {p.original_price && p.original_price > (p.current_price ?? 0) && (
          <div className="text-xs text-gray-400 line-through">{fmt(p.original_price, currency)}</div>
        )}
      </td>

      {/* Target */}
      <td className="py-3 px-2 text-right text-sm text-gray-500">{fmt(p.target_price)}</td>

      {/* % to target */}
      <td className="py-3 px-2 text-right">
        {pct != null ? (
          <span className={`text-sm font-medium ${pct <= 0 ? 'text-green-600' : pct <= 10 ? 'text-yellow-600' : 'text-gray-500'}`}>
            {pct > 0 ? `+${pct}%` : `${pct}%`}
          </span>
        ) : '—'}
      </td>

      {/* Sparkline */}
      <td className="py-3 px-2">
        <PriceSparkline productId={p.id} />
      </td>

      {/* Status dropdown */}
      <td className="py-3 px-2">
        <select value={status} onChange={e => updateStatus(e.target.value as ProductStatus)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer">
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </td>

      {/* Last checked */}
      <td className="py-3 px-2 text-xs text-gray-400 whitespace-nowrap">{timeAgo(p.last_checked)}</td>

      {/* Actions */}
      <td className="py-3 pl-2 pr-4">
        <div className="flex items-center gap-1">
          <a href={p.url} target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-500 p-1 rounded transition-colors">
            <ExternalLink size={14} />
          </a>
          <button onClick={deleteProduct} className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}
