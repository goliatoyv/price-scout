'use client'
import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Product, ProductStatus, ALL_STATUSES, STATUS_META } from '@/lib/types'
import { QuickFilter } from '@/app/page'
import { ProductRow } from './ProductRow'

type SortKey = 'name' | 'current_price' | 'target_price' | 'last_checked' | 'created_at'

interface Props {
  products: Product[]
  onUpdate: () => void
  quickFilter: QuickFilter
  onQuickFilter: (f: QuickFilter) => void
}

const QUICK_CHIPS: { label: string; filter: QuickFilter }[] = [
  { label: '🎯 Нижче цілі',  filter: 'below_target' },
  { label: '✅ В наявності', filter: 'in_stock'     },
  { label: '🔥 Пріоритет',  filter: 'hot'          },
]

function applyQuickFilter(list: Product[], qf: QuickFilter): Product[] {
  if (qf === 'below_target') return list.filter(p =>
    p.current_price != null && p.target_price != null && p.current_price <= p.target_price
  )
  if (qf === 'in_stock')     return list.filter(p => p.in_stock === true)
  if (qf === 'hot')          return list.filter(p => p.priority === 3)
  if (qf === 'checked_24h')  return list.filter(p =>
    p.last_checked && Date.now() - new Date(p.last_checked).getTime() < 86400000
  )
  return list
}

export function WatchList({ products, onUpdate, quickFilter, onQuickFilter }: Props) {
  const [query,      setQuery]  = useState('')
  const [filterStat, setFStat]  = useState<ProductStatus | ''>('')
  const [filterSite, setFSite]  = useState('')
  const [sortKey,    setSortK]  = useState<SortKey>('created_at')
  const [sortAsc,    setSortA]  = useState(false)

  const sites = useMemo(() => [...new Set(products.map(p => p.site_domain).filter(Boolean))], [products])

  const filtered = useMemo(() => {
    let list = products
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.site_domain?.toLowerCase().includes(q)
      )
    }
    if (filterStat) list = list.filter(p => p.status === filterStat)
    if (filterSite) list = list.filter(p => p.site_domain === filterSite)
    list = applyQuickFilter(list, quickFilter)

    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
    })
    return list
  }, [products, query, filterStat, filterSite, sortKey, sortAsc, quickFilter])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortA(a => !a)
    else { setSortK(key); setSortA(true) }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-20">↕</span>
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: 'name',          label: 'Товар' },
    { key: 'current_price', label: 'Ціна'  },
    { key: 'target_price',  label: 'Ціль'  },
  ]

  const hasFilters = !!(query || filterStat || filterSite || quickFilter)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        {/* Row 1: search + dropdowns */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Пошук..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={filterStat} onChange={e => setFStat(e.target.value as ProductStatus | '')}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Всі статуси</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={filterSite} onChange={e => setFSite(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Всі сайти</option>
            {sites.map(s => <option key={s!} value={s!}>{s}</option>)}
          </select>
        </div>

        {/* Row 2: quick-filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_CHIPS.map(c => (
            <button
              key={c.filter}
              onClick={() => onQuickFilter(c.filter)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                ${quickFilter === c.filter
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
            >
              {c.label}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setFStat(''); setFSite(''); onQuickFilter('') }}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <X size={12} /> Скинути фільтри
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-gray-400 font-medium border-b border-gray-100">
              <th className="py-3 pl-4 pr-2 w-16"></th>
              {headers.map(h => (
                <th key={h.key} className="py-3 px-2 cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => toggleSort(h.key)}>
                  <span className="flex items-center gap-1">{h.label} <SortIcon k={h.key} /></span>
                </th>
              ))}
              <th className="py-3 px-2">% до цілі</th>
              <th className="py-3 px-2">Тренд</th>
              <th className="py-3 px-2">Статус</th>
              <th className="py-3 px-2 cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('last_checked')}>
                <span className="flex items-center gap-1">Перевірено <SortIcon k="last_checked" /></span>
              </th>
              <th className="py-3 pl-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                {products.length === 0 ? 'Список порожній. Додайте перший товар!' : 'Нічого не знайдено.'}
              </td></tr>
            ) : (
              filtered.map(p => <ProductRow key={p.id} product={p} onUpdate={onUpdate} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
        {filtered.length} з {products.length} позицій
        {quickFilter && <span className="ml-2 text-blue-500">· активний фільтр</span>}
      </div>
    </div>
  )
}
