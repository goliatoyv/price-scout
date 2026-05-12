'use client'
import { useState } from 'react'
import { X, ExternalLink, Loader } from 'lucide-react'
import { Product, ProductStatus, ALL_STATUSES, STATUS_META } from '@/lib/types'
import { fmt } from '@/lib/utils'

interface Props {
  product: Product
  onUpdated: () => void
  trigger: React.ReactNode
}

export function EditProductModal({ product: p, onUpdated, trigger }: Props) {
  const [open,     setOpen]   = useState(false)
  const [loading,  setLoad]   = useState(false)
  const [name,     setName]   = useState(p.name || '')
  const [target,   setTarget] = useState(p.target_price?.toString() || '')
  const [size,     setSize]   = useState(p.size || '')
  const [notes,    setNotes]  = useState(p.notes || '')
  const [priority, setPrio]   = useState(p.priority?.toString() || '1')
  const [status,   setStatus] = useState<ProductStatus>(p.status)

  function openModal() {
    setName(p.name || '')
    setTarget(p.target_price?.toString() || '')
    setSize(p.size || '')
    setNotes(p.notes || '')
    setPrio(p.priority?.toString() || '1')
    setStatus(p.status)
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
          status,
        }),
      })
      setOpen(false)
      onUpdated()
    } finally {
      setLoad(false)
    }
  }

  const currency = p.currency || 'USD'
  const domain   = p.site_domain || new URL(p.url).hostname.replace('www.', '')

  return (
    <>
      <span onClick={openModal} className="contents cursor-pointer">{trigger}</span>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Редагувати позицію</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Product preview card */}
            <div className="px-6 py-4 border-b border-gray-100 flex gap-4 items-center bg-gray-50/60">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="w-16 h-16 object-contain rounded-xl bg-white border border-gray-100 flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">👟</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 line-clamp-2 leading-snug">
                  {p.name || <span className="text-gray-400 italic">Назва не визначена</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">{domain}</div>
                <div className="flex items-center gap-3 mt-1.5">
                  {p.current_price != null && (
                    <span className="text-sm font-bold text-gray-800">{fmt(p.current_price, currency)}</span>
                  )}
                  {p.original_price != null && p.original_price > (p.current_price ?? 0) && (
                    <span className="text-xs text-gray-400 line-through">{fmt(p.original_price, currency)}</span>
                  )}
                  {p.in_stock === false && (
                    <span className="text-xs text-red-500">Немає в наявності</span>
                  )}
                </div>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="text-gray-300 hover:text-blue-500 flex-shrink-0 transition-colors">
                <ExternalLink size={16} />
              </a>
            </div>

            {/* Form */}
            <div className="overflow-y-auto">
              <form onSubmit={submit} id="edit-form">
                <div className="px-6 py-5 space-y-4">

                  <div className="grid grid-cols-2 gap-3">
                    {/* Target price */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                        Цільова ціна
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={target} onChange={e => setTarget(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Size */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                        Розмір
                      </label>
                      <input
                        value={size} onChange={e => setSize(e.target.value)}
                        placeholder="M9 / EU43"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Status */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                        Статус
                      </label>
                      <select
                        value={status} onChange={e => setStatus(e.target.value as ProductStatus)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {ALL_STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Priority */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                        Пріоритет
                      </label>
                      <select
                        value={priority} onChange={e => setPrio(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="1">Звичайний</option>
                        <option value="2">Високий</option>
                        <option value="3">🔥 Терміново</option>
                      </select>
                    </div>
                  </div>

                  {/* Name override */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      Назва <span className="normal-case font-normal text-gray-400">(якщо хочеш змінити)</span>
                    </label>
                    <input
                      value={name} onChange={e => setName(e.target.value)}
                      placeholder={p.name || 'Назва з сайту'}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      Нотатки
                    </label>
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      rows={2} placeholder="Будь-які нотатки..."
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                type="button" onClick={() => setOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Скасувати
              </button>
              <button
                type="submit" form="edit-form" disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <><Loader size={14} className="animate-spin" /> Зберігаємо...</> : 'Зберегти'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
