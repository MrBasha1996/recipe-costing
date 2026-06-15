'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, BrandId } from '@/types'

interface Props {
  brand: BrandId
  product: Product | null
  onClose: () => void
  onSaved: () => void
}

export default function ProductForm({ brand, product, onClose, onSaved }: Props) {
  const isEdit = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [price, setPrice] = useState(product?.price?.toString() ?? '0')
  const [appPrice, setAppPrice] = useState(product?.app_price?.toString() ?? '')
  const [hasApp, setHasApp] = useState(!!product?.app_price)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim() || !sku.trim()) { setError('الاسم والـ SKU مطلوبان'); return }
    setSaving(true); setError('')
    const supabase = createClient()

    const payload = {
      sku: sku.trim(),
      brand_id: brand as string,
      name: name.trim(),
      category: 'Meal' as const,
      price: parseFloat(price) || 0,
      app_price: hasApp && appPrice ? parseFloat(appPrice) : null,
      unit: null,
      is_base: false,
    }

    const db = supabase.from('products') as any
    const { error: dbErr } = isEdit
      ? await db.update(payload).eq('sku', product!.sku).eq('brand_id', brand)
      : await db.insert(payload)

    if (dbErr) { setError(dbErr.message); setSaving(false); return }
    onSaved()
  }

  const inputCls = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500 transition-colors"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold">{isEdit ? 'تعديل المنتج' : 'إضافة منتج'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">الاسم</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="اسم المنتج"
              className={inputCls}
            />
          </div>

          {/* SKU */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKU</label>
            <input
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="sk-0001"
              dir="ltr"
              disabled={isEdit}
              className={`${inputCls} font-mono disabled:opacity-50 disabled:bg-gray-50`}
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">السعر (ريال)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              min="0" step="0.5"
              dir="ltr"
              className={`${inputCls} font-mono`}
            />
          </div>

          {/* APP Price */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasApp}
                onChange={e => setHasApp(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm text-gray-700">متوفر على التطبيق بسعر مختلف</span>
            </label>
            {hasApp && (
              <input
                type="number"
                value={appPrice}
                onChange={e => setAppPrice(e.target.value)}
                placeholder="سعر التطبيق"
                min="0" step="0.5"
                dir="ltr"
                className={`${inputCls} font-mono border-blue-400`}
              />
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
