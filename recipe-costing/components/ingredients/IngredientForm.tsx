'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePeriod } from '@/hooks/usePeriod'
import { formatYearMonth } from '@/lib/period'
import type { Ingredient, BrandId } from '@/types'

interface Props {
  brand: BrandId
  ingredient: Ingredient | null
  onClose: () => void
  onSaved: () => void
}

interface MonthlyAvg {
  year_month: string
  avg_cost: number
  entry_count: number
  source: string
}

function getYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function upsertMonthlyAvg(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  sku: string,
  itemName: string,
  unit: string,
  newCost: number,
) {
  const yearMonth = getYearMonth()

  // Fetch existing record so we can compute running average
  const { data: existing } = await (supabase.from('price_monthly_avg') as any)
    .select('avg_cost, entry_count')
    .eq('brand_id', brandId)
    .eq('sku', sku)
    .eq('year_month', yearMonth)
    .maybeSingle()

  const oldCount: number = existing?.entry_count ?? 0
  const newCount = oldCount + 1
  // Running weighted average: (old_avg * old_count + new_price) / new_count
  const newAvg = oldCount > 0
    ? (existing.avg_cost * oldCount + newCost) / newCount
    : newCost

  await (supabase.from('price_monthly_avg') as any).upsert(
    {
      brand_id: brandId,
      sku,
      item_name: itemName,
      unit,
      year_month: yearMonth,
      avg_cost: newAvg,
      entry_count: newCount,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'brand_id,sku,year_month' },
  )
}

export default function IngredientForm({ brand, ingredient, onClose, onSaved }: Props) {
  const isEdit = !!ingredient
  const [name, setName] = useState(ingredient?.name ?? '')
  const [sku, setSku] = useState(ingredient?.sku ?? '')
  const [category, setCategory] = useState(ingredient?.category ?? '')
  const [unit, setUnit] = useState(ingredient?.unit ?? 'جرام')
  const [cost, setCost] = useState(ingredient?.cost?.toString() ?? '0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyAvg[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const [buyUnit, setBuyUnit] = useState('')
  const [convFactor, setConvFactor] = useState('')

  const { isCurrentClosed, currentYM } = usePeriod()

  useEffect(() => {
    if (!isEdit || !ingredient) return
    const supabase = createClient()
    ;(supabase.from('price_monthly_avg') as any)
      .select('year_month, avg_cost, entry_count, source')
      .eq('brand_id', brand)
      .eq('sku', ingredient.sku)
      .order('year_month', { ascending: false })
      .limit(18)
      .then(({ data }: any) => {
        setMonthlyHistory((data as MonthlyAvg[]) || [])
        setHistoryReady(true)
      })
  }, [brand, ingredient, isEdit])

  useEffect(() => {
    if (!isEdit || !ingredient) return
    const supabase = createClient()
    ;(supabase.from('unit_conversions') as any)
      .select('buy_unit, factor')
      .eq('brand_id', brand)
      .eq('ing_sku', ingredient.sku)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setBuyUnit(data.buy_unit || '')
          setConvFactor(data.factor != null ? String(data.factor) : '')
        }
      })
  }, [brand, ingredient, isEdit])

  async function handleSave() {
    if (!name.trim() || !sku.trim() || !category.trim()) {
      setError('الاسم والـ SKU والفئة مطلوبة'); return
    }
    const newCostVal = parseFloat(cost) || 0
    if (isEdit && ingredient && ingredient.cost !== newCostVal && isCurrentClosed) {
      setError(`فترة ${formatYearMonth(currentYM)} مغلقة — لا يمكن تغيير السعر`)
      return
    }
    setSaving(true); setError('')
    const supabase = createClient()
    const newCost = newCostVal

    if (isEdit && ingredient && ingredient.cost !== newCost) {
      // Record individual change in price_history
      await (supabase.from('price_history') as any).insert({
        brand_id: brand,
        sku: ingredient.sku,
        item_name: ingredient.name,
        item_type: 'ingredient',
        old_price: ingredient.cost,
        new_price: newCost,
      })
      // Upsert monthly average
      await upsertMonthlyAvg(supabase, brand, ingredient.sku, ingredient.name, ingredient.unit, newCost)
    }

    const payload = {
      sku: sku.trim(),
      brand_id: brand as string,
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      cost: newCost,
      is_base: false,
    }

    const { error: dbErr } = isEdit
      ? await (supabase.from('ingredients') as any).update(payload).eq('sku', ingredient!.sku).eq('brand_id', brand)
      : await (supabase.from('ingredients') as any).insert(payload)

    if (dbErr) { setError(dbErr.message); setSaving(false); return }

    const factorNum = parseFloat(convFactor)
    if (buyUnit.trim() && factorNum > 0) {
      await (supabase.from('unit_conversions') as any).upsert({
        brand_id: brand,
        ing_sku: sku.trim(),
        ing_name: name.trim(),
        buy_unit: buyUnit.trim(),
        recipe_unit: unit.trim(),
        factor: factorNum,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'brand_id,ing_sku' })
    } else if (!buyUnit.trim() && isEdit) {
      await (supabase.from('unit_conversions') as any)
        .delete()
        .eq('brand_id', brand)
        .eq('ing_sku', sku.trim())
    }

    onSaved()
  }

  const inputCls = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500 transition-colors"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-gray-900 font-semibold">{isEdit ? 'تعديل المادة الخام' : 'إضافة مادة خام'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">الاسم</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المادة الخام"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKU</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="sk-0001" dir="ltr"
              disabled={isEdit}
              className={`${inputCls} font-mono disabled:opacity-50 disabled:bg-gray-50`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">الفئة</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="بهارات"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">الوحدة</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="جرام"
                className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">التكلفة / وحدة (ريال)</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)}
              min="0" step="0.000001" dir="ltr"
              disabled={isEdit && isCurrentClosed}
              className={`${inputCls} font-mono disabled:opacity-50 disabled:bg-gray-50`} />
            {isEdit && isCurrentClosed && (
              <p className="text-xs text-red-500 mt-1">
                🔒 الفترة الحالية مغلقة — لا يمكن تغيير السعر
              </p>
            )}
          </div>

          {/* Monthly Average Price History */}
          {isEdit && historyReady && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">متوسط السعر الشهري</p>
                <span className="text-xs text-gray-400">آخر 18 شهر</span>
              </div>
              {monthlyHistory.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-400 text-center">
                  لا يوجد سجل شهري — سيُسجَّل بعد أول تعديل للسعر
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <table suppressHydrationWarning className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 bg-gray-100">
                        <th className="text-right px-3 py-2">الشهر</th>
                        <th className="text-center px-3 py-2">متوسط التكلفة</th>
                        <th className="text-center px-3 py-2">تحديثات</th>
                        <th className="text-center px-3 py-2">المصدر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {monthlyHistory.map((m, i) => {
                        const [y, mo] = m.year_month.split('-')
                        const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('ar-SA', {
                          month: 'long', year: 'numeric',
                        })
                        const isCurrentMonth = m.year_month === getYearMonth()
                        return (
                          <tr key={m.year_month} className={isCurrentMonth ? 'bg-blue-50' : ''}>
                            <td className="px-3 py-2 text-gray-700 font-medium">
                              {label}
                              {isCurrentMonth && (
                                <span className="mr-1 text-blue-500 text-xs">(الحالي)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-gray-900 font-semibold">
                              {m.avg_cost.toFixed(6)}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-500">
                              {m.entry_count}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                                m.source === 'purchase'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-200 text-gray-600'
                              }`}>
                                {m.source === 'purchase' ? 'شراء' : 'يدوي'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-gray-100 border-t border-gray-200 text-xs text-gray-400">
                    سيُحدَّث تلقائياً عند ربط عمليات الشراء
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-medium text-gray-600 mb-3">تحويل وحدة الشراء <span className="text-gray-400 font-normal">(اختياري)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">وحدة الشراء</label>
                <input
                  value={buyUnit}
                  onChange={e => setBuyUnit(e.target.value)}
                  placeholder="علبة / كيلو / كرتون"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  معامل التحويل
                </label>
                <input
                  type="number"
                  value={convFactor}
                  onChange={e => setConvFactor(e.target.value)}
                  placeholder="1000"
                  min="0.001"
                  step="any"
                  dir="ltr"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            {buyUnit.trim() && parseFloat(convFactor) > 0 && (
              <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg px-3 py-1.5">
                1 {buyUnit} = {convFactor} {unit || 'وحدة'}
              </p>
            )}
            {!buyUnit.trim() && isEdit && (
              <p className="text-xs text-gray-400 mt-1.5">
                احذف وحدة الشراء لإزالة التحويل
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
