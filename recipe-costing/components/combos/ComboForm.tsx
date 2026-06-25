'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ComboMeal, ComboMealItem, BrandId } from '@/types'

interface ProductOption {
  sku: string
  name: string
}

interface ItemDraft {
  _key: string
  product_sku: string
  product_name: string
  qty: number
  unit_cost: number
  total_cost: number
}

interface Props {
  brand: BrandId
  combo: ComboMeal | null
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

export default function ComboForm({ brand, combo, onClose, onSaved }: Props) {
  const isEdit = !!combo

  const [name, setName]         = useState(combo?.name ?? '')
  const [sku, setSku]           = useState(combo?.sku ?? '')
  const [price, setPrice]       = useState(combo?.price?.toString() ?? '')
  const [appPrice, setAppPrice] = useState(combo?.app_price?.toString() ?? '')

  const [items, setItems]       = useState<ItemDraft[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Product search
  const [allProducts, setAllProducts]     = useState<ProductOption[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown]   = useState(false)
  const [loadingCost, setLoadingCost]     = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Calculated metrics
  const totalCost    = items.reduce((s, it) => s + it.total_cost, 0)
  const priceNum     = parseFloat(price) || 0
  const appPriceNum  = parseFloat(appPrice) || 0
  const fcPct        = priceNum > 0 ? (totalCost / priceNum) * 100 : 0
  const margin       = priceNum - totalCost
  const marginApp    = appPriceNum > 0 ? appPriceNum - totalCost : null

  // Load products list
  useEffect(() => {
    const supabase = createClient()
    ;(supabase.from('products') as any)
      .select('sku, name')
      .eq('brand_id', brand)
      .eq('is_semi', false)
      .order('name')
      .then(({ data }: any) => setAllProducts(data ?? []))
  }, [brand])

  // Load existing items when editing
  useEffect(() => {
    if (!combo?.id) return
    const supabase = createClient()
    ;(supabase.from('combo_meal_items') as any)
      .select('*')
      .eq('combo_id', combo.id)
      .order('sort_order')
      .then(({ data }: any) => {
        if (!data) return
        setItems((data as ComboMealItem[]).map(it => ({
          _key: it.id,
          product_sku:  it.product_sku,
          product_name: it.product_name,
          qty:          it.qty,
          unit_cost:    it.unit_cost,
          total_cost:   it.total_cost,
        })))
      })
  }, [combo?.id])

  const filteredProducts = productSearch.trim()
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())
      )
    : []

  // Fetch unit cost from recipe for a product (active first, fallback to latest saved)
  const fetchUnitCost = useCallback(async (productSku: string): Promise<number> => {
    const supabase = createClient()
    const { data: active } = await (supabase.from('recipes') as any)
      .select('total_cost, yield_portions')
      .eq('brand_id', brand)
      .eq('sku', productSku)
      .eq('is_semi', false)
      .eq('is_active', true)
      .maybeSingle()

    let row = active
    if (!row) {
      const { data: latest } = await (supabase.from('recipes') as any)
        .select('total_cost, yield_portions')
        .eq('brand_id', brand)
        .eq('sku', productSku)
        .eq('is_semi', false)
        .order('saved_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      row = latest
    }

    if (!row) return 0
    const yp = Math.max(row.yield_portions ?? 1, 1)
    return parseFloat((row.total_cost / yp).toFixed(4))
  }, [brand])

  async function handleAddProduct(p: ProductOption) {
    // Don't add duplicates
    if (items.some(it => it.product_sku === p.sku)) {
      setProductSearch('')
      setShowDropdown(false)
      return
    }
    setLoadingCost(p.sku)
    const unitCost = await fetchUnitCost(p.sku)
    setLoadingCost(null)
    setItems(prev => [
      ...prev,
      {
        _key:         crypto.randomUUID(),
        product_sku:  p.sku,
        product_name: p.name,
        qty:          1,
        unit_cost:    unitCost,
        total_cost:   unitCost,
      },
    ])
    setProductSearch('')
    setShowDropdown(false)
  }

  function handleQtyChange(key: string, val: string) {
    const qty = parseFloat(val) || 0
    setItems(prev =>
      prev.map(it =>
        it._key === key
          ? { ...it, qty, total_cost: parseFloat((it.unit_cost * qty).toFixed(4)) }
          : it
      )
    )
  }

  function handleRemoveItem(key: string) {
    setItems(prev => prev.filter(it => it._key !== key))
  }

  async function handleSave() {
    if (!name.trim()) { setError('الاسم مطلوب'); return }
    if (!sku.trim())  { setError('SKU مطلوب'); return }
    if (items.length === 0) { setError('أضف منتجاً واحداً على الأقل'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    const comboPayload = {
      brand_id:      brand,
      sku:           sku.trim().toUpperCase(),
      name:          name.trim(),
      price:         priceNum,
      app_price:     appPriceNum > 0 ? appPriceNum : null,
      total_cost:    parseFloat(totalCost.toFixed(4)),
      food_cost_pct: parseFloat(fcPct.toFixed(1)),
      margin:        parseFloat(margin.toFixed(2)),
      margin_app:    marginApp != null ? parseFloat(marginApp.toFixed(2)) : null,
      is_active:     true,
    }

    let comboId: string
    if (isEdit && combo) {
      const { error: updErr } = await (supabase.from('combo_meals') as any)
        .update(comboPayload)
        .eq('id', combo.id)
      if (updErr) { setError(updErr.message); setSaving(false); return }
      comboId = combo.id
      // Delete old items then re-insert
      await (supabase.from('combo_meal_items') as any).delete().eq('combo_id', comboId)
    } else {
      const { data, error: insErr } = await (supabase.from('combo_meals') as any)
        .insert(comboPayload)
        .select('id')
        .single()
      if (insErr || !data) { setError(insErr?.message ?? 'خطأ في الحفظ'); setSaving(false); return }
      comboId = data.id
    }

    const itemsPayload = items.map((it, idx) => ({
      combo_id:     comboId,
      brand_id:     brand,
      product_sku:  it.product_sku,
      product_name: it.product_name,
      qty:          it.qty,
      unit_cost:    it.unit_cost,
      total_cost:   parseFloat(it.total_cost.toFixed(4)),
      sort_order:   idx,
    }))

    const { error: itemsErr } = await (supabase.from('combo_meal_items') as any).insert(itemsPayload)
    if (itemsErr) { setError(itemsErr.message); setSaving(false); return }

    setSaving(false)
    onSaved()
  }

  const fcColor =
    fcPct > 35 ? 'text-red-600' :
    fcPct > 28 ? 'text-amber-600' :
    'text-green-600'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">
            {isEdit ? 'تعديل كومبو' : 'إضافة كومبو جديد'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">اسم الكومبو</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: كومبو العائلة"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">SKU</label>
              <input
                value={sku}
                onChange={e => setSku(e.target.value.toUpperCase())}
                placeholder="مثال: CMB-001"
                className={`${inputCls} font-mono`}
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">سعر البيع (ر.س)</label>
              <input
                type="number" min="0" step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">سعر التطبيق (ر.س)</label>
              <input
                type="number" min="0" step="0.01"
                value={appPrice}
                onChange={e => setAppPrice(e.target.value)}
                placeholder="اختياري"
                className={inputCls}
              />
            </div>
          </div>

          {/* Product search */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">إضافة منتج للكومبو</label>
            <div className="relative">
              <input
                ref={searchRef}
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder="ابحث باسم المنتج أو SKU..."
                className={inputCls}
                disabled={loadingCost !== null}
              />
              {loadingCost && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">جارٍ جلب التكلفة...</span>
              )}
              {showDropdown && filteredProducts.length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-52 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map(p => (
                    <button
                      key={p.sku}
                      type="button"
                      onMouseDown={() => handleAddProduct(p)}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {showDropdown && productSearch.trim() && filteredProducts.length === 0 && (
              <p className="text-xs text-gray-400 px-1">لا توجد منتجات مطابقة</p>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-right px-4 py-2.5 font-medium">المنتج</th>
                    <th className="text-center px-4 py-2.5 font-medium w-24">الكمية</th>
                    <th className="text-center px-4 py-2.5 font-medium">تكلفة الوحدة</th>
                    <th className="text-center px-4 py-2.5 font-medium">الإجمالي</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it._key} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{it.product_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{it.product_sku}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={it.qty}
                          onChange={e => handleQtyChange(it._key, e.target.value)}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">
                        {it.unit_cost > 0 ? it.unit_cost.toFixed(4) : <span className="text-amber-500">لا وصفة</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono font-semibold text-gray-900">
                        {it.total_cost.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => handleRemoveItem(it._key)}
                          className="text-red-400 hover:text-red-600 text-base leading-none"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cost summary */}
          {items.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
              <div className="text-xs font-semibold text-gray-500 mb-3">ملخص التكاليف</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-500">إجمالي التكلفة</div>
                  <div className="font-mono font-bold text-gray-900 text-base mt-0.5">
                    {totalCost.toFixed(2)} <span className="text-xs font-normal text-gray-400">ر.س</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">نسبة التكلفة</div>
                  <div className={`font-mono font-bold text-base mt-0.5 ${priceNum > 0 ? fcColor : 'text-gray-400'}`}>
                    {priceNum > 0 ? `${fcPct.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">هامش البيع</div>
                  <div className="font-mono font-bold text-emerald-600 text-base mt-0.5">
                    {priceNum > 0 ? `${margin.toFixed(2)} ر.س` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">هامش التطبيق</div>
                  <div className="font-mono font-bold text-blue-600 text-base mt-0.5">
                    {marginApp != null ? `${marginApp.toFixed(2)} ر.س` : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الكومبو'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
