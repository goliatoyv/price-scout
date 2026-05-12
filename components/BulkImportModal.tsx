'use client'
import { useState } from 'react'
import { X, Upload, ChevronRight, Check, Loader } from 'lucide-react'

interface ParsedProduct { url: string; name: string; selected: boolean }

interface Props { onAdded: () => void }

export function BulkImportModal({ onAdded }: Props) {
  const [open,    setOpen]   = useState(false)
  const [step,    setStep]   = useState<1 | 2 | 3>(1)
  const [url,     setUrl]    = useState('')
  const [target,  setTarget] = useState('')
  const [size,    setSize]   = useState('')
  const [items,   setItems]  = useState<ParsedProduct[]>([])
  const [loading, setLoad]   = useState(false)
  const [error,   setError]  = useState('')
  const [result,  setResult] = useState<{ added: number } | null>(null)

  function reset() {
    setStep(1); setUrl(''); setTarget(''); setSize('')
    setItems([]); setError(''); setResult(null)
  }

  function close() { setOpen(false); reset() }

  // Step 1 → 2: fetch and parse category page
  async function scanPage() {
    setLoad(true); setError('')
    try {
      const r = await fetch('/api/scrape/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'Помилка сканування')
      if (!data.products?.length) throw new Error('Товари не знайдено на сторінці')
      setItems(data.products.map((p: { url: string; name: string }) => ({ ...p, selected: true })))
      setStep(2)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoad(false)
    }
  }

  // Step 2 → 3: bulk insert selected
  async function importSelected() {
    const selected = items.filter(i => i.selected)
    if (!selected.length) { setError('Оберіть хоча б один товар'); return }
    setLoad(true); setError('')
    try {
      const r = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: selected.map(i => ({
            url:          i.url,
            name:         i.name || null,
            target_price: target ? +target : null,
            size:         size || null,
          })),
        }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error)
      setResult(data)
      setStep(3)
      onAdded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoad(false)
    }
  }

  function toggleAll(val: boolean) {
    setItems(prev => prev.map(i => ({ ...i, selected: val })))
  }

  const selectedCount = items.filter(i => i.selected).length

  return (
    <>
      <button onClick={() => { setOpen(true); reset() }}
        className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-medium text-sm transition-colors">
        <Upload size={16} /> Масовий імпорт
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Масовий імпорт</h2>
                <div className="flex items-center gap-2 mt-1">
                  {[1,2,3].map(s => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                        ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {step > s ? <Check size={10} /> : s}
                      </span>
                      <span className={`text-xs ${step === s ? 'text-gray-700' : 'text-gray-400'}`}>
                        {s === 1 ? 'URL розділу' : s === 2 ? 'Вибір товарів' : 'Готово'}
                      </span>
                      {s < 3 && <ChevronRight size={12} className="text-gray-300" />}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Вставте посилання на розділ/категорію — система автоматично знайде всі товари на сторінці.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL розділу *</label>
                    <input value={url} onChange={e => setUrl(e.target.value)}
                      placeholder="https://www.joesnewbalanceoutlet.com/c/mens-running..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Цільова ціна для всіх</label>
                      <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)}
                        placeholder="90.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Розмір для всіх</label>
                      <input value={size} onChange={e => setSize(e.target.value)} placeholder="M9 / EU43"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Знайдено <b>{items.length}</b> товарів. Оберіть які додати:
                    </p>
                    <div className="flex gap-3 text-sm">
                      <button onClick={() => toggleAll(true)}  className="text-blue-600 hover:underline">Всі</button>
                      <button onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Жодного</button>
                    </div>
                  </div>

                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {items.map((item, i) => (
                      <label key={i}
                        className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors
                          ${item.selected ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-transparent hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={item.selected}
                          onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, selected: e.target.checked } : it))}
                          className="mt-0.5 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium line-clamp-1">{item.name || '—'}</div>
                          <div className="text-xs text-gray-400 truncate">{item.url}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={32} className="text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Імпорт завершено!</h3>
                  <p className="text-gray-500 text-sm">
                    Додано <b>{result?.added}</b> нових товарів до списку.
                    <br />Ціни будуть перевірені при наступному запуску скрапера.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              {step === 1 && (
                <>
                  <button onClick={close} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Скасувати</button>
                  <button onClick={scanPage} disabled={!url || loading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
                    {loading ? <><Loader size={14} className="animate-spin" /> Сканую...</> : 'Сканувати сторінку →'}
                  </button>
                </>
              )}
              {step === 2 && (
                <>
                  <button onClick={() => { setStep(1); setError('') }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">← Назад</button>
                  <button onClick={importSelected} disabled={!selectedCount || loading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
                    {loading
                      ? <><Loader size={14} className="animate-spin" /> Додаємо...</>
                      : `Додати ${selectedCount} товарів →`}
                  </button>
                </>
              )}
              {step === 3 && (
                <button onClick={close}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
                  Готово
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  )
}
