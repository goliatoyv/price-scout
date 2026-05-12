'use client'
import { STATUS_META, ProductStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: ProductStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}
