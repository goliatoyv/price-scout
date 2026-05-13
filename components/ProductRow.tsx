'use client'
import { useState } from 'react'
import { Trash2, ExternalLink, RefreshCw } from 'lucide-react'
import { Product, ProductStatus, STATUS_META, ALL_STATUSES } from '@/lib/types'
import { fmt, pctToTarget, timeAgo } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { PriceSparkline } from './PriceSparkline'
import { EditProductModal } from './EditProductModal'

interface Props { product: Product; onUpdate: () => void }

export function ProductRow({ product: p, onUpdate }: Props) {
  const [status, setStatus]      = useState<ProductStatus>(p.status)
  const [refreshing, setRefresh] = useState(false)

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

  async function refreshPrice() {
    setRefresh(true)
    await fetch('/api/scrape/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: p.id }),
    })
    setRefresh(false)
    onUpdate()
  }

  const pct      = pctToTarget(p.current_price, p.target_price)
  const isHot    = pct != null && pct <= 0
  const currency = p.currency || 'USD'

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors group ${isHot ? 'bg-green-50/30' : ''}`}>

      {/* Image — click opens edit */}
      <td className="py-3 pl-4 pr-2">
        <EditProductModal product={p} onUpdated={onUpdate} trigger={
          <div className="cursor-pointer">
            {p.image_url
              ? <img src={p.image_url} alt="" className="w-12 h-12 object-contain rounded-lg" />
              : <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-lg">👟</div>
            }
          </div>
        } />
      </td>

      {/* Name + domain — click opens edit */}
      <td className="py-3 px-2 max-w-[220px]">
        <EditProductModal product={p} onUpdated={onUpdate} trigger={
          <div className="cursor-pointer">
            <div className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 transition-colors">
              {p.name || <span className="text-gray-400 italic text-xs">без назви</span>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{p.site_domain}</div>
            {(p.color || p.size) && (
              <div className="text-xs text-gray-500 mt-0.5">
                {[p.color, p.size && `Розмір: ${p.size}`].filter(Boolean).join(' · ')}
              </div>
            )}
            {p.priority === 3 && <span className="text-xs">🔥</span>}
          </div>
        } />
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
        <select
          value={status}
          onChange={e => updateStatus(e.target.value as ProductStatus)}
          onClick={e => e.stopPropagation()}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </td>

      {/* Last checked */}
      <td className="py-3 px-2 whitespace-nowrap">
        <div className="text-xs text-gray-400">{timeAgo(p.last_checked)}</div>
        {p.last_checked && (
          <div className="text-xs text-gray-300">
            {new Date(p.last_checked).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
            {' '}
            {new Date(p.last_checked).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 pl-2 pr-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a href={p.url} target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-500 p-1 rounded transition-colors" title="Відкрити сайт">
            <ExternalLink size={14} />
          </a>
          <button onClick={refreshPrice} disabled={refreshing}
            className="text-gray-400 hover:text-blue-500 p-1 rounded transition-colors disabled:opacity-40" title="Оновити ціну">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={deleteProduct}
            className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors" title="Видалити">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}
