'use client'
import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Props { onAdded: () => void }

export function AddProductModal({ onAdded }: Props) {
  const [open, setOpen]     = useState(false)
  const [loading, setLoad]  = useState(false)
  const [url, setUrl]       = useState('')
  const [target, setTarget] = useState('')
  const [size, setSize]     = useState('')
  const [notes, setNotes]   = useState('')
  const [priority, setPrio] = useState('1')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoad(true)
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, target_price: target ? +target : null, size, notes, priority: +priority }),
      })
      setOpen(false); setUrl(''); setTarget(''); setSize(''); setNotes('')
      onAdded()
    } finally { setLoad(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors">
        <Plus size={16} /> Add Product
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Product</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product URL *</label>
                <input required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Price</label>
                  <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="90.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <input value={size} onChange={e => setSize(e.target.value)} placeholder="M9 / EU43"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select value={priority} onChange={e => setPrio(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="1">Normal</option>
                  <option value="2">High</option>
                  <option value="3">🔥 Urgent</option>
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl font-medium text-sm transition-colors">
                {loading ? 'Adding...' : 'Add Product'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
