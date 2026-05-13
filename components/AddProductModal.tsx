'use client'
import { useState } from 'react'
import { X, Plus, Loader, Link, ChevronLeft } from 'lucide-react'

interface Props { onAdded: () => void }

type Phase = 'idle' | 'discovering' | 'saving' | 'scraping'
type Step  = 'url' | 'pick' | 'manual'

interface Variant {
  color:          string | null
  size:           string | null
  price:          number | null
  original_price: number | null
  currency:       string | null
  in_stock:       boolean | null
  image_url:      string | null
  sku:            string | null
  name:           string | null
  url:            string | null
}

interface DiscoveryResponse {
  groupName:  string | null
  groupImage: string | null
  variants:   Variant[]
}

export function AddProductModal({ onAdded }: Props) {
  const [open, setOpen]       = useState(false)
  const [step, setStep]       = useState<Step>('url')
  const [phase, setPhase]     = useState<Phase>('idle')

  const [url, setUrl]         = useState('')
  const [target, setTarget]   = useState('')

  // Step 'pick': variant selection
  const [groupName, setGroupName]   = useState<string | null>(null)
  const [variants, setVariants]     = useState<Variant[]>([])
  const [picked, setPicked]         = useState<Set<number>>(new Set())

  // Step 'manual': single product with explicit color/size
  const [color, setColor]     = useState('')
  const [size, setSize]       = useState('')

  const [error, setError]     = useState('')

  function reset() {
    setOpen(false)
    setStep('url')
    setPhase('idle')
    setUrl(''); setTarget('')
    setGroupName(null); setVariants([]); setPicked(new Set())
    setColor(''); setSize('')
    setError('')
  }

  async function discover() {
    setError('')
    setPhase('discovering')
    try {
      const r = await fetch('/api/scrape/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const d: DiscoveryResponse = await r.json()
      if (!r.ok) throw new Error((d as { error?: string }).error || 'Не вдалося обробити сторінку')

      const priced = d.variants.filter(v => v.price != null)

      if (priced.length === 0) {
        // Nothing found — fall back to manual single-product mode.
        setStep('manual')
      } else if (priced.length === 1) {
        // Only one variant — just add it directly via the manual path with
        // its color/size prefilled.
        setColor(priced[0].color ?? '')
        setSize(priced[0].size ?? '')
        setStep('manual')
      } else {
        setGroupName(d.groupName)
        setVariants(priced)
        setPicked(new Set(priced.map((_, i) => i)))  // default: all selected
        setStep('pick')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  async function saveSelected() {
    setError('')
    setPhase('saving')
    try {
      const items = Array.from(picked).map(i => ({
        color:        variants[i].color,
        size:         variants[i].size,
        target_price: target ? +target : null,
        name:         variants[i].name,
        image_url:    variants[i].image_url,
        url:          variants[i].url || url,
      }))
      if (items.length === 0) throw new Error('Виберіть хоча б один варіант')

      const r = await fetch('/api/products/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ baseUrl: url, groupKey: url, items }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Помилка збереження')

      setPhase('scraping')
      const ids: string[] = d.ids ?? []
      // Fire-and-await scrape of each — they update the row asynchronously
      // and we'll refresh the list after.
      await Promise.allSettled(ids.map(id =>
        fetch('/api/scrape/product', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productId: id }),
        })
      ))

      onAdded()
      reset()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPhase('saving')
    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          target_price: target ? +target : null,
          color: color.trim() || null,
          size:  size.trim()  || null,
        }),
      })
      const product = await r.json()
      if (!r.ok || product.error) throw new Error(product.error || 'Помилка збереження')

      setPhase('scraping')
      await fetch('/api/scrape/product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId: product.id }),
      })

      onAdded()
      reset()
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={e => { if (e.target === e.currentTarget && !loading) reset() }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">
                {step === 'url'    && 'Додати товар'}
                {step === 'pick'   && (groupName || 'Виберіть варіанти')}
                {step === 'manual' && 'Додати товар'}
              </h2>
              <button onClick={reset} disabled={loading}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X size={20} />
              </button>
            </div>

            {/* Step 1: URL input */}
            {step === 'url' && (
              <div className="space-y-4">
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
                  <p className="text-xs text-gray-400 mt-1">
                    Якщо на сторінці є кілька кольорів/розмірів — система знайде і запропонує їх.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  onClick={discover}
                  disabled={!url || loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-medium text-sm transition-colors"
                >
                  {phase === 'discovering'
                    ? <><Loader size={14} className="animate-spin" /> Шукаємо варіанти...</>
                    : 'Далі'}
                </button>

                <button
                  onClick={() => setStep('manual')}
                  disabled={!url || loading}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 underline decoration-dotted"
                >
                  Додати як один товар (без пошуку варіантів)
                </button>
              </div>
            )}

            {/* Step 2: Pick variants */}
            {step === 'pick' && (
              <div className="space-y-4">
                <button onClick={() => setStep('url')} disabled={loading}
                        className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
                  <ChevronLeft size={14} /> Назад
                </button>

                <div className="text-xs text-gray-500">
                  Знайдено <strong>{variants.length}</strong> варіантів. Виберіть, які додати у Watch List.
                </div>

                <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-100">
                  {variants.map((v, i) => {
                    const checked = picked.has(i)
                    return (
                      <label key={i} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(picked)
                            if (checked) next.delete(i); else next.add(i)
                            setPicked(next)
                          }}
                          className="w-4 h-4 rounded"
                        />
                        {v.image_url && (
                          <img src={v.image_url} alt="" className="w-12 h-12 rounded object-cover bg-gray-100" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {[v.color, v.size].filter(Boolean).join(' · ') || v.sku || 'Варіант'}
                          </div>
                          {v.name && <div className="text-xs text-gray-400 truncate">{v.name}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {v.price != null
                              ? `${v.currency ?? '$'}${v.price.toFixed(2)}`
                              : '—'}
                          </div>
                          {v.original_price != null && v.price != null && v.original_price > v.price && (
                            <div className="text-xs text-gray-400 line-through">
                              {v.currency ?? '$'}{v.original_price.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Цільова ціна для всіх <span className="normal-case text-gray-400 font-normal">(опц.)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01" min="0"
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  onClick={saveSelected}
                  disabled={picked.size === 0 || loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-medium text-sm transition-colors"
                >
                  {phase === 'saving'   && <><Loader size={14} className="animate-spin" /> Зберігаємо...</>}
                  {phase === 'scraping' && <><Loader size={14} className="animate-spin" /> Завантажуємо ціни...</>}
                  {phase === 'idle'     && `Додати обрані (${picked.size})`}
                </button>
              </div>
            )}

            {/* Step 3: Manual fallback */}
            {step === 'manual' && (
              <form onSubmit={saveManual} className="space-y-4">
                <button type="button" onClick={() => setStep('url')} disabled={loading}
                        className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
                  <ChevronLeft size={14} /> Назад
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Колір <span className="normal-case text-gray-400 font-normal">(опц.)</span>
                    </label>
                    <input value={color} onChange={e => setColor(e.target.value)}
                           placeholder="Grey Matter"
                           className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Розмір <span className="normal-case text-gray-400 font-normal">(опц.)</span>
                    </label>
                    <input value={size} onChange={e => setSize(e.target.value)}
                           placeholder="M8 / EU42"
                           className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Цільова ціна <span className="normal-case text-gray-400 font-normal">(опц.)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" min="0" value={target}
                           onChange={e => setTarget(e.target.value)} placeholder="0.00"
                           className="w-full pl-7 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-medium text-sm transition-colors">
                  {phase === 'idle'     && 'Додати'}
                  {phase === 'saving'   && <><Loader size={14} className="animate-spin" /> Зберігаємо...</>}
                  {phase === 'scraping' && <><Loader size={14} className="animate-spin" /> Завантажуємо дані...</>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
