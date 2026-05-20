'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { FC_TARGET } from '@/lib/calculations'
import type { Recipe } from '@/types'

interface Props {
  recipes: Recipe[]
}

export default function Top10Chart({ recipes }: Props) {
  const data = recipes.map(r => ({
    name: r.product_name.length > 18 ? r.product_name.slice(0, 18) + '…' : r.product_name,
    fc: parseFloat(r.food_cost_pct.toFixed(1)),
    color: r.food_cost_pct <= FC_TARGET ? '#22c55e' : r.food_cost_pct <= 45 ? '#f59e0b' : '#ef4444',
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">أعلى 10 وصفات بالـ FC%</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 'auto']}
            tickFormatter={v => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a202c' }}
            cursor={{ fill: '#f3f4f6' }}
            formatter={(val) => [`${val}%`, 'Food Cost']}
          />
          <ReferenceLine
            x={FC_TARGET}
            stroke="#d1d5db"
            strokeDasharray="4 2"
            label={{ value: `${FC_TARGET}%`, fill: '#9ca3af', fontSize: 10, position: 'top' }}
          />
          <Bar dataKey="fc" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
