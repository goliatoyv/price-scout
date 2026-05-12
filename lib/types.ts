export type ProductStatus = 'watching' | 'alert' | 'to_buy' | 'ordered' | 'in_stock' | 'skipped'

export interface Product {
  id: string
  url: string
  name: string | null
  site_domain: string | null
  target_price: number | null
  size: string | null
  status: ProductStatus
  priority: number
  image_url: string | null
  notes: string | null
  created_at: string
  current_price: number | null
  original_price: number | null
  in_stock: boolean | null
  last_checked: string | null
  currency: string | null
}

export interface PriceCheck {
  id: string
  product_id: string
  price: number
  original_price: number | null
  currency: string
  in_stock: boolean
  checked_at: string
  parser_strategy: string | null
}

export const STATUS_META: Record<ProductStatus, { label: string; color: string }> = {
  watching: { label: '👀 Watching',  color: 'bg-gray-100 text-gray-700' },
  alert:    { label: '🔔 Alert!',    color: 'bg-yellow-100 text-yellow-800' },
  to_buy:   { label: '✅ To Buy',    color: 'bg-green-100 text-green-800' },
  ordered:  { label: '📦 Ordered',   color: 'bg-blue-100 text-blue-800' },
  in_stock: { label: '🏠 In Stock',  color: 'bg-purple-100 text-purple-800' },
  skipped:  { label: '❌ Skipped',   color: 'bg-red-100 text-red-700' },
}

export const ALL_STATUSES: ProductStatus[] = ['watching','alert','to_buy','ordered','in_stock','skipped']
