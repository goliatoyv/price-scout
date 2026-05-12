'use client'
import { useState } from 'react'
import { X, Plus, Loader, Link } from 'lucide-react'

interface Props { onAdded: () => void }

type Phase = 'idle' | 'saving' | 'scraping'

export function AddProductModal({ onAdded }: Props) {
  const [open, setOpen]     = useState(false)
  const [phase, setPhase]   = useState<Phase>('idle')
  const [url, setUrl]       = useState('')
  const [target, setTarget] = useState('')
  const [error, setError]   = useState('')

  function close() {
    setOpen(false); setUrl(''); setTarget(''); setError(''); setPhase('idle')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPhase('saving')
    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, target_price: target ? +target : null }),
      })
      const product = await r.json()
      if (!r.ok || product.error) throw new Error(product.error || 'Помилка збереження')

      setPhase('scraping')
      await fetch('/api/scrape/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })

      onAdded()
      close()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const loading = phase !== 'idle'

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors">
        <Plus size={16} /> Додати товар
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) close() }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Додати товар</h2>
              <button onClick={close} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {/* URL */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Посилання на товар
                </label>
                <div className="relative">
                  <Link size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    required
                    autoFocus
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Target price */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Цільова ціна <span className="normal-case text-gray-400 font-normal">(необов&apos;язково)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Назва, фото та ціна підтягнуться автоматично</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!url || loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-medium text-sm transition-colors"
              >
                {phase === 'idle'    && 'Додати'}
                {phase === 'saving'  && <><Loader size={14} className="animate-spin" /> Зберігаємо...</>}
                {phase === 'scraping' && <><Loader size={14} className="animate-spin" /> Завантажуємо дані з сайту...</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
