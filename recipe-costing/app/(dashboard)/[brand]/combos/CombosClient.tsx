'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import ComboTable from '@/components/combos/ComboTable'
import ComboForm from '@/components/combos/ComboForm'
import type { ComboMeal, BrandId } from '@/types'

interface Props {
  initialCombos: ComboMeal[]
  brand: BrandId
}

export default function CombosClient({ initialCombos, brand }: Props) {
  const router = useRouter()
  const { canEdit, canSeePrices } = useUserStore()
  const [combos, setCombos] = useState<ComboMeal[]>(initialCombos)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editCombo, setEditCombo] = useState<ComboMeal | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { setCombos(initialCombos) }, [initialCombos])

  const filtered = combos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.sku.toLowerCase().includes(search.toLowerCase())
  )

  function handleEdit(c: ComboMeal) { setEditCombo(c); setShowForm(true) }
  function handleClose() { setShowForm(false); setEditCombo(null) }

  async function handleDelete(c: ComboMeal) {
    if (!confirm(`حذف كومبو "${c.name}"؟`)) return
    const supabase = createClient()
    await (supabase.from('combo_meals') as any).delete().eq('id', c.id)
    router.refresh()
  }

  async function handleRecalcAll() {
    if (!confirm('إعادة احتساب تكاليف جميع الكومبو بناءً على أسعار الوصفات الحالية؟')) return
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const supabase = createClient()

      // جلب الكومبو مع مكوناتها
      const { data: comboData } = await (supabase.from('combo_meals') as any)
        .select('id, price, app_price, combo_meal_items(id, product_sku, qty)')
        .eq('brand_id', brand)
        .eq('is_active', true)

      const comboList = (comboData || []) as any[]
      if (comboList.length === 0) { setRecalcMsg({ ok: false, text: 'لا توجد كومبو نشطة' }); return }

      // تجميع SKUs الفريدة
      const skus = new Set<string>()
      for (const c of comboList)
        for (const it of (c.combo_meal_items || [])) skus.add(it.product_sku)

      // جلب أسعار الوصفات (نشطة أولاً)
      const priceMap = new Map<string, number>()
      if (skus.size > 0) {
        const { data: activeRecs } = await (supabase.from('recipes') as any)
          .select('sku, total_cost, yield_portions')
          .eq('brand_id', brand)
          .eq('is_semi', false)
          .eq('is_active', true)
          .in('sku', [...skus])
        for (const r of (activeRecs || []) as any[])
          if (r.yield_portions > 0) priceMap.set(r.sku, r.total_cost / r.yield_portions)

        // fallback: آخر وصفة محفوظة للـ SKU غير الموجودة
        const missing = [...skus].filter(s => !priceMap.has(s))
        for (const sku of missing) {
          const { data: lat } = await (supabase.from('recipes') as any)
            .select('sku, total_cost, yield_portions')
            .eq('brand_id', brand)
            .eq('sku', sku)
            .eq('is_semi', false)
            .order('saved_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lat && lat.yield_portions > 0) priceMap.set(sku, lat.total_cost / lat.yield_portions)
        }
      }

      let updated = 0
      for (const combo of comboList) {
        const items = (combo.combo_meal_items || []) as any[]
        let totalCost = 0

        for (const item of items) {
          const unitCost = parseFloat((priceMap.get(item.product_sku) ?? 0).toFixed(4))
          const itemTotal = parseFloat((unitCost * item.qty).toFixed(4))
          totalCost += itemTotal
          await (supabase.from('combo_meal_items') as any)
            .update({ unit_cost: unitCost, total_cost: itemTotal })
            .eq('id', item.id)
        }

        const price    = combo.price ?? 0
        const appPrice = combo.app_price ?? null
        const fcPct    = price > 0 ? (totalCost / price) * 100 : 0
        await (supabase.from('combo_meals') as any)
          .update({
            total_cost:    parseFloat(totalCost.toFixed(4)),
            food_cost_pct: parseFloat(fcPct.toFixed(1)),
            margin:        parseFloat((price - totalCost).toFixed(2)),
            margin_app:    appPrice != null ? parseFloat((appPrice - totalCost).toFixed(2)) : null,
          })
          .eq('id', combo.id)
        updated++
      }

      setRecalcMsg({ ok: true, text: `تم تحديث ${updated} كومبو ✓` })
      router.refresh()
    } catch (e: any) {
      setRecalcMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setRecalculating(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const supabase = createClient()
      const { data } = await (supabase.from('combo_meals') as any)
        .select('name, sku, price, app_price, total_cost, food_cost_pct, margin, margin_app, combo_meal_items(product_name, product_sku, qty, unit_cost, total_cost)')
        .eq('brand_id', brand)
        .order('name')

      const rows = (data || []) as any[]
      const headers = [
        'اسم الكومبو', 'SKU', 'سعر البيع', 'سعر التطبيق',
        'التكلفة الكلية', 'نسبة التكلفة', 'هامش البيع', 'هامش التطبيق',
        'المنتجات',
      ]
      const csvRows = rows.map(c => [
        c.name,
        c.sku,
        c.price?.toFixed(2) ?? '',
        c.app_price?.toFixed(2) ?? '',
        c.total_cost?.toFixed(4) ?? '',
        c.food_cost_pct != null ? `${c.food_cost_pct.toFixed(1)}%` : '',
        c.margin?.toFixed(2) ?? '',
        c.margin_app?.toFixed(2) ?? '',
        ((c.combo_meal_items || []) as any[])
          .map((it: any) => `${it.product_name} ×${it.qty}`)
          .join(' | '),
      ])

      const csv = [headers, ...csvRows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `combos-${brand}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">وجبات الكومبو</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} كومبو</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm w-56 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm px-3 py-2 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-40"
          >
            {exporting ? '...' : '↓ تصدير'}
          </button>
          {canEdit('combos') && (
            <>
              <button
                onClick={handleRecalcAll}
                disabled={recalculating}
                className="text-sm px-3 py-2 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-40"
              >
                {recalculating ? '...' : '↻ تحديث التكلفة'}
              </button>
              <button
                onClick={() => { setEditCombo(null); setShowForm(true) }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                + إضافة كومبو
              </button>
            </>
          )}
        </div>
      </div>

      {recalcMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg border ${
          recalcMsg.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {recalcMsg.text}
        </div>
      )}

      <ComboTable
        combos={filtered}
        canEdit={canEdit('combos')}
        canSeePrices={canSeePrices()}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {showForm && (
        <ComboForm
          brand={brand}
          combo={editCombo}
          onClose={handleClose}
          onSaved={() => { handleClose(); router.refresh() }}
        />
      )}
    </div>
  )
}
