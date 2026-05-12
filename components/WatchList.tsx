'use client'
import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown } from 'lucide-react'
import { Product, ProductStatus, ALL_STATUSES, STATUS_META } from '@/lib/types'
import { ProductRow } from './ProductRow'

type SortKey = 'name' | 'current_price' | 'target_price' | 'last_checked' | 'created_at'

interface Props { products: Product[]; onUpdate: () => void }

export function WatchList({ products, onUpdate }: Props) {
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

    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
    })
    return list
  }, [products, query, filterStat, filterSite, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortA(a => !a)
    else { setSortK(key); setSortA(true) }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-20">↕</span>
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: 'name',          label: 'Product'      },
    { key: 'current_price', label: 'Price'        },
    { key: 'target_price',  label: 'Target'       },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterStat} onChange={e => setFStat(e.target.value as ProductStatus | '')}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterSite} onChange={e => setFSite(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All sites</option>
          {sites.map(s => <option key={s!} value={s!}>{s}</option>)}
        </select>
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
              <th className="py-3 px-2">% to Target</th>
              <th className="py-3 px-2">Trend</th>
              <th className="py-3 px-2">Status</th>
              <th className="py-3 px-2 cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('last_checked')}>
                <span className="flex items-center gap-1">Checked <SortIcon k="last_checked" /></span>
              </th>
              <th className="py-3 pl-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                {products.length === 0 ? 'No products yet. Add your first one!' : 'No results found.'}
              </td></tr>
            ) : (
              filtered.map(p => <ProductRow key={p.id} product={p} onUpdate={onUpdate} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
        {filtered.length} of {products.length} items
      </div>
    </div>
  )
}
