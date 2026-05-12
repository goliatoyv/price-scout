'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface Props { productId: string }

export function PriceSparkline({ productId }: Props) {
  const [data, setData] = useState<{ price: number; checked_at: string }[]>([])

  useEffect(() => {
    fetch(`/api/products/${productId}/history`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [productId])

  if (data.length < 2) return <span className="text-gray-300 text-xs">no data</span>

  return (
    <div className="w-24 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Price']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.checked_at?.slice(0,10) ?? ''}
            contentStyle={{ fontSize: 11 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
