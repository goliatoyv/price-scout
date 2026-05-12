'use client'
import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import { Product } from '@/lib/types'

interface Props { product: Product; onUpdated: () => void }

export function EditProductModal({ product: p, onUpdated }: Props) {
  const [open,     setOpen]   = useState(false)
  const [loading,  setLoad]   = useState(false)
  const [name,     setName]   = useState(p.name || '')
  const [target,   setTarget] = useState(p.target_price?.toString() || '')
  const [size,     setSize]   = useState(p.size || '')
  const [notes,    setNotes]  = useState(p.notes || '')
  const [priority, setPrio]   = useState(p.priority?.toString() || '1')

  function openModal() {
    setName(p.name || '')
    setTarget(p.target_price?.toString() || '')
    setSize(p.size || '')
    setNotes(p.notes || '')
    setPrio(p.priority?.toString() || '1')
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoad(true)
    try {
      await fetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         name || null,
          target_price: target ? +target : null,
          size:         size || null,
          notes:        notes || null,
          priority:     +priority,
        }),
      })
      setOpen(false)
      onUpdated()
    } finally {
      setLoad(false)
    }
  }

  return (
    <>
      <button onClick={openModal} title="Редагувати"
        className="text-gray-400 hover:text-blue-500 p-1 rounded transition-colors">
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Редагувати позицію</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-400 truncate">{p.url}</div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Назва</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Назва товару"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Цільова ціна</label>
                  <input type="number" step="0.01" min="0" value={target}
                    onChange={e => setTarget(e.target.value)} placeholder="90.00"
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
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Будь-які нотатки..."
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

              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Скасувати
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl font-medium text-sm transition-colors">
                  {loading ? 'Зберігаємо...' : 'Зберегти'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
