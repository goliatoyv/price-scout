'use client'
import { useState } from 'react'
import { X, Plus, Loader } from 'lucide-react'

interface Props { onAdded: () => void }

type Phase = 'idle' | 'saving' | 'scraping'

export function AddProductModal({ onAdded }: Props) {
  const [open, setOpen]     = useState(false)
  const [phase, setPhase]   = useState<Phase>('idle')
  const [url, setUrl]       = useState('')
  const [target, setTarget] = useState('')
  const [size, setSize]     = useState('')
  const [notes, setNotes]   = useState('')
  const [priority, setPrio] = useState('1')
  const [error, setError]   = useState('')

  function close() {
    setOpen(false); setUrl(''); setTarget(''); setSize('')
    setNotes(''); setPrio('1'); setError(''); setPhase('idle')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPhase('saving')
    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, target_price: target ? +target : null, size, notes, priority: +priority }),
      })
      const product = await r.json()
      if (!r.ok || product.error) throw new Error(product.error || 'Помилка збереження')

      setPhase('scraping')
      // auto-scrape: fetch price, name, image
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
  const btnLabel = phase === 'saving'
    ? <><Loader size={14} className="animate-spin" /> Зберігаємо...</>
    : phase === 'scraping'
    ? <><Loader size={14} className="animate-spin" /> Завантажуємо з сайту...</>
    : 'Додати товар'

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors">
        <Plus size={16} /> Додати товар
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Додати товар</h2>
              <button onClick={close} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL товару *</label>
                <input required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Цільова ціна</label>
                  <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="90.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Розмір</label>
                  <input value={size} onChange={e => setSize(e.target.value)} placeholder="M9 / EU43"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Нотатки</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Будь-які нотатки..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пріоритет</label>
                <select value={priority} onChange={e => setPrio(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="1">Звичайний</option>
                  <option value="2">Високий</option>
                  <option value="3">🔥 Терміново</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2 rounded-xl font-medium text-sm transition-colors">
                {btnLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
