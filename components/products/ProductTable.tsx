'use client'

import type { Product } from '@/types'

interface Props {
  products: Product[]
  canEdit: boolean
  canSeePrices: boolean
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
}

export default function ProductTable({ products, canEdit, canSeePrices, onEdit, onDelete }: Props) {
  if (products.length === 0) {
    return <div className="text-center text-gray-400 py-16">لا توجد منتجات</div>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table suppressHydrationWarning className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500 text-xs bg-gray-50">
            <th className="text-right px-4 py-3 font-medium">الاسم</th>
            <th className="text-right px-4 py-3 font-medium">SKU</th>
            {canSeePrices && (
              <>
                <th className="text-center px-4 py-3 font-medium">السعر</th>
                <th className="text-center px-4 py-3 font-medium">APP</th>
              </>
            )}
            {canEdit && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map(p => (
            <tr key={p.sku} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-900 font-medium">{p.name}</td>
              <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.sku}</td>
              {canSeePrices && (
                <>
                  <td className="px-4 py-3 text-center font-mono text-gray-800">
                    {p.price > 0 ? `${p.price.toFixed(2)} ر` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-blue-600">
                    {p.app_price ? `${p.app_price.toFixed(2)} ر` : '—'}
                  </td>
                </>
              )}
              {canEdit && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(p)}
                      className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      تعديل
                    </button>
                    {!p.is_base && (
                      <button
                        onClick={() => onDelete(p)}
                        className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
