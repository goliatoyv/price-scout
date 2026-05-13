'use client'
import { useEffect, useState, useCallback } from 'react'
import { Product } from '@/lib/types'
import { StatsBar } from '@/components/StatsBar'
import { HotDeals } from '@/components/HotDeals'
import { WatchList } from '@/components/WatchList'
import { AddProductModal } from '@/components/AddProductModal'

export type QuickFilter = '' | 'below_target' | 'in_stock' | 'hot' | 'checked_24h'

export default function Dashboard() {
  const [products,     setProducts]     = useState<Product[]>([])
  const [loading,      setLoading]      = useState(true)
  const [quickFilter,  setQuickFilter]  = useState<QuickFilter>('')

  const load = useCallback(async () => {
    const r = await fetch('/api/products')
    const data = await r.json()
    setProducts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price Scout 👟</h1>
          <p className="text-sm text-gray-500 mt-0.5">Моніторинг цін для баєра</p>
        </div>
        <div className="flex items-center gap-2">
          <AddProductModal onAdded={load} />
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Завантаження...</div>
      ) : (
        <>
          <StatsBar
            products={products}
            activeFilter={quickFilter}
            onFilter={f => setQuickFilter(prev => prev === f ? '' : f)}
          />
          <HotDeals products={products} />
          <WatchList
            products={products}
            onUpdate={load}
            quickFilter={quickFilter}
            onQuickFilter={f => setQuickFilter(prev => prev === f ? '' : f)}
          />
        </>
      )}
    </main>
  )
}
