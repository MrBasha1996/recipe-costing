'use client'
import type { BrandId } from '@/types'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { qc, cacheKey } from '@/lib/queryCache'
import { useCostingStore } from '@/stores/costingStore'
import { useParams } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { calcServiceCost, FC_TARGET, VAT_RATE } from '@/lib/calculations'
import RecipeIdentityCard from '@/components/costing/RecipeIdentityCard'
import RecipeCostBar from '@/components/costing/RecipeCostBar'
import RecipeFoodTable from '@/components/costing/RecipeFoodTable'
import RecipePackageTable from '@/components/costing/RecipePackageTable'
import RecipeChartsRow from '@/components/costing/RecipeChartsRow'
import RecipePriceHistory from '@/components/costing/RecipePriceHistory'
import RecipeHistory from '@/components/costing/RecipeHistory'
import RecipeVersionDiff from '@/components/costing/RecipeVersionDiff'
import { usePeriod } from '@/hooks/usePeriod'
import { formatYearMonth } from '@/lib/period'
import type { ComponentItem, RecipeIngredientRow, RecipeRowDraft, ServiceType, Recipe } from '@/types'

// ── helpers ───────────────────────────────────────────────────────

interface RecipeVersion {
  id: string
  version: number
  version_name: string | null
  is_active: boolean
  is_approved: boolean
  saved_at: string
  food_cost_pct: number | null
}

function fcAccentColor(pct: number | null): string {
  if (pct == null) return '#e5e7eb'
  if (pct <= FC_TARGET) return '#22c55e'
  if (pct <= 45) return '#f59e0b'
  return '#ef4444'
}

const PRINT_PALETTE_FOOD   = ['#1a3a4a','#2d6a4f','#1b4f72','#9a6f1e','#7f8c8d','#8e44ad','#16a085','#c0392b']
const PRINT_PALETTE_PKG_DI = ['#2c3e50','#34495e','#546e7a','#607d8b','#455a64','#37474f']
const PRINT_PALETTE_PKG_DO = ['#c85a1e','#e8743b','#b04010','#d06030','#a03000','#803000']

// ── component ─────────────────────────────────────────────────────

export default function RecipeEditor() {
  const { brand } = useParams() as { brand: BrandId }
  const {
    currentProduct, rows, setRows, savedRecipe, setSavedRecipe,
    addRow, updateRow, removeRow,
    activeService, setActiveService,
    forceReloadAt,
  } = useCostingStore()
  const { canSeePrices, canEdit, profile } = useUserStore()
  const { isSuperAdmin, hasPermission } = usePermissionsStore()
  const canSeeP = canSeePrices()
  const canE = canEdit()
  const canApprove = isSuperAdmin || hasPermission('costing', 'approve')
  const isMgmt = isSuperAdmin || hasPermission('costing', 'edit_price')

  const [sellPrice, setSellPrice] = useState(0)
  const [appPrice, setAppPrice] = useState<number | null>(null)
  const [yieldPortions, setYieldPortions] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showVersionDiff, setShowVersionDiff] = useState(false)
  const [versions, setVersions] = useState<RecipeVersion[]>([])
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { isCurrentClosed, currentYM } = usePeriod()

  const isApproved = savedRecipe?.is_approved ?? false
  const canEditRecipe = canE && !isApproved

  // ── derived row slices ────────────────────────────────────────
  const foodRows    = rows.filter(r => r.section === 'food')
  const diPackaging = rows.filter(r => r.section === 'packaging' && r.service_type === 'dine_in')
  const doPackaging = rows.filter(r => r.section === 'packaging' && r.service_type === 'dine_out')

  // ── load versions list ────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    if (!currentProduct) return
    const supabase = createClient()
    const { data } = await (supabase.from('recipes') as any)
      .select('id, version, version_name, is_active, is_approved, saved_at, food_cost_pct')
      .eq('sku', currentProduct.sku)
      .eq('brand_id', brand as string)
      .eq('is_semi', !!currentProduct.is_semi)
      .order('version', { ascending: false })
    setVersions((data as RecipeVersion[]) || [])
  }, [currentProduct, brand])

  // ── load ──────────────────────────────────────────────────────
  const loadRecipe = useCallback(async (recipeId?: string) => {
    if (!currentProduct) return
    setLoading(true)
    setSaveMsg(null)
    setDirty(false)

    const supabase = createClient()
    let rec: any = null

    if (recipeId) {
      const { data } = await (supabase.from('recipes') as any)
        .select('*, recipe_ingredients(*)')
        .eq('id', recipeId)
        .maybeSingle()
      rec = data
    } else {
      // Try active version first (requires migration to have run)
      const { data: active } = await (supabase.from('recipes') as any)
        .select('*, recipe_ingredients(*)')
        .eq('sku', currentProduct.sku)
        .eq('brand_id', brand as string)
        .eq('is_semi', !!currentProduct.is_semi)
        .eq('is_active', true)
        .maybeSingle()
      if (active) {
        rec = active
      } else {
        // Fallback: load any version (before migration or single version)
        const { data: any_ } = await (supabase.from('recipes') as any)
          .select('*, recipe_ingredients(*)')
          .eq('sku', currentProduct.sku)
          .eq('brand_id', brand as string)
          .eq('is_semi', !!currentProduct.is_semi)
          .order('saved_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        rec = any_
      }
    }

    let pricesUpdated = false
    let bigChangeMsg: string | null = null

    if (rec) {
      setSavedRecipe(rec)
      // Sell/app price always from current product — not from saved snapshot
      setSellPrice(currentProduct.price)
      setAppPrice(currentProduct.app_price)
      setYieldPortions(rec.yield_portions)

      const draftRows: RecipeRowDraft[] = ((rec.recipe_ingredients || []) as RecipeIngredientRow[])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(r => ({
          id: r.id,
          ing_sku: r.ing_sku,
          ing_name: r.ing_name,
          qty: r.qty,
          unit: r.unit,
          unit_cost: r.unit_cost,   // will be refreshed below
          yield_pct: r.yield_pct,
          is_semi: r.is_semi,
          section: r.section ?? 'food',
          service_type: r.service_type ?? 'both',
        }))

      // ── Refresh costs ─────────────────────────────────────────
      const rmSkus = [...new Set(draftRows.filter(r => !r.is_semi).map(r => r.ing_sku))]
      const btSkus = [...new Set(draftRows.filter(r =>  r.is_semi).map(r => r.ing_sku))]
      const priceMap = new Map<string, number>()

      const cachedPrices = qc.get<Record<string, number>>(cacheKey.ingPrices(brand as string))
      if (cachedPrices) {
        for (const [sku, cost] of Object.entries(cachedPrices)) priceMap.set(sku, cost)
      }

      // جلب الأسعار المفقودة من الكاش فقط (أو كلها إذا لا يوجد كاش)
      const missingRmSkus = rmSkus.filter(s => !priceMap.has(s))
      const missingBtSkus = btSkus.filter(s => !priceMap.has(s))

      if (missingRmSkus.length > 0 || missingBtSkus.length > 0) {
        const [ingResult, btResult] = await Promise.all([
          missingRmSkus.length > 0
            ? (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand as string).in('sku', missingRmSkus)
            : Promise.resolve({ data: [] }),
          missingBtSkus.length > 0
            ? (supabase.from('recipes') as any).select('sku, total_cost, yield_portions').eq('brand_id', brand as string).eq('is_semi', true).eq('is_active', true).in('sku', missingBtSkus)
            : Promise.resolve({ data: [] }),
        ])

        const updatedSnapshot: Record<string, number> = { ...(cachedPrices ?? {}) }
        for (const ing of (ingResult.data || []) as any[]) {
          priceMap.set(ing.sku, ing.cost)
          updatedSnapshot[ing.sku] = ing.cost
        }
        for (const r of (btResult.data || []) as any[]) {
          if (r.yield_portions > 0) {
            const cost = r.total_cost / r.yield_portions
            priceMap.set(r.sku, cost)
            updatedSnapshot[r.sku] = cost
          }
        }
        qc.set(cacheKey.ingPrices(brand as string), updatedSnapshot)
      }

      const updatedRows = draftRows.map(r => {
        const fresh = priceMap.get(r.ing_sku)
        if (fresh !== undefined && Math.abs(fresh - r.unit_cost) > 0.0001) {
          pricesUpdated = true
          // اكتشاف تغيّر كبير (>10×) في سعر باتش — على الأرجح خطأ في yield_portions
          if (r.is_semi && r.unit_cost > 0.001 && (fresh / r.unit_cost > 10 || r.unit_cost / fresh > 10)) {
            const factor = Math.round(fresh > r.unit_cost ? fresh / r.unit_cost : r.unit_cost / fresh)
            bigChangeMsg = `⚠ سعر '${r.ing_name}' تغيّر بشكل كبير (×${factor}) — راجع بيانات الباتش`
          }
          return { ...r, unit_cost: fresh }
        }
        return r
      })

      setRows(updatedRows)
    } else {
      setSavedRecipe(null)
      setSellPrice(currentProduct.price)
      setAppPrice(currentProduct.app_price)
      setYieldPortions(1)
      setRows([])
    }

    setLoading(false)
    if (pricesUpdated) {
      if (rec?.is_approved) {
        setDirty(false)
        setSaveMsg({ ok: false, text: bigChangeMsg ?? '⚠ تغيّرت أسعار بعض المكونات منذ الاعتماد — أنشئ إصداراً جديداً للتحديث' })
      } else {
        setDirty(true)
        setSaveMsg({ ok: false, text: bigChangeMsg ?? '⚠ تغيّرت أسعار بعض المكونات — راجع وأعد الحفظ' })
      }
    } else {
      setDirty(false)
    }
  }, [currentProduct, brand, setSavedRecipe, setRows])

  useEffect(() => { Promise.all([loadRecipe(), loadVersions()]) }, [loadRecipe, loadVersions])

  // إعادة التحميل عند إعادة الاحتساب الجماعي من السايدبار
  useEffect(() => {
    if (forceReloadAt > 0 && currentProduct) {
      loadRecipe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceReloadAt])

  // ── calculations ──────────────────────────────────────────────
  const diResult = useMemo(
    () => calcServiceCost(foodRows, diPackaging, yieldPortions, sellPrice, appPrice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, yieldPortions, sellPrice, appPrice],
  )
  const doResult = useMemo(
    () => calcServiceCost(foodRows, doPackaging, yieldPortions, sellPrice, appPrice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, yieldPortions, sellPrice, appPrice],
  )

  // ── handlers ─────────────────────────────────────────────────
  function handleAddFood(item: ComponentItem) {
    addRow({
      id: crypto.randomUUID(),
      ing_sku: item.sku,
      ing_name: item.name,
      qty: 1,
      unit: item.unit,
      unit_cost: item.cost,
      yield_pct: 100,
      is_semi: item.is_semi,
      section: 'food',
      service_type: 'both',
    })
    setDirty(true)
  }

  function handleAddPackaging(item: ComponentItem, serviceType: 'dine_in' | 'dine_out') {
    addRow({
      id: crypto.randomUUID(),
      ing_sku: item.sku,
      ing_name: item.name,
      qty: 1,
      unit: item.unit,
      unit_cost: item.cost,
      yield_pct: 100,
      is_semi: item.is_semi,
      section: 'packaging',
      service_type: serviceType,
    })
    setDirty(true)
  }

  function handleRowChange(id: string, updates: Partial<RecipeRowDraft>) {
    updateRow(id, updates)
    setDirty(true)
  }

  function handleRowDelete(id: string) {
    removeRow(id)
    setDirty(true)
  }

  async function handleNewVersion() {
    if (!currentProduct || !savedRecipe) return
    setCreatingVersion(true)
    try {
      const supabase = createClient()
      const profile = useUserStore.getState().profile
      const maxVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 1
      const nextVersion = maxVersion + 1

      const { data: newRec, error } = await (supabase.from('recipes') as any)
        .insert({
          sku: currentProduct.sku,
          brand_id: brand as string,
          product_name: currentProduct.name,
          is_semi: currentProduct.is_semi,
          version: nextVersion,
          version_name: `إصدار ${nextVersion}`,
          is_active: false,
          sell_price: sellPrice,
          app_price: appPrice,
          yield_portions: yieldPortions,
          total_cost: diResult.totalCost,
          food_cost_pct: diResult.foodCostPct,
          margin: diResult.margin,
          margin_app: diResult.marginApp,
          dine_out_total_cost: doResult.totalCost,
          dine_out_food_cost_pct: doResult.foodCostPct,
          dine_out_margin: doResult.margin,
          saved_by: profile?.id ?? null,
          saved_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error

      // Copy current rows to new version
      if (rows.length > 0) {
        await (supabase.from('recipe_ingredients') as any).insert(
          rows.map((r, i) => ({
            recipe_id: newRec.id,
            ing_sku: r.ing_sku,
            ing_name: r.ing_name,
            qty: r.qty,
            unit: r.unit,
            unit_cost: r.unit_cost,
            yield_pct: r.yield_pct,
            is_semi: r.is_semi,
            section: r.section,
            service_type: r.service_type,
            sort_order: i,
          })),
        )
      }

      setSavedRecipe(newRec as Recipe)
      await loadVersions()
      setSaveMsg({ ok: true, text: `تم إنشاء إصدار ${nextVersion} ✓` })
      setDirty(false)
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setCreatingVersion(false)
    }
  }

  async function handleActivate() {
    if (!currentProduct || !savedRecipe) return
    setSaving(true)
    try {
      const supabase = createClient()
      // Activate current version FIRST — ensures product is never left with zero active versions
      await (supabase.from('recipes') as any)
        .update({ is_active: true })
        .eq('id', savedRecipe.id)
      // Deactivate all other versions for this product
      await (supabase.from('recipes') as any)
        .update({ is_active: false })
        .eq('sku', currentProduct.sku)
        .eq('brand_id', brand as string)
        .eq('is_semi', !!currentProduct.is_semi)
        .neq('id', savedRecipe.id)
      await loadVersions()
      setSaveMsg({ ok: true, text: 'تم تفعيل هذا الإصدار ✓' })
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    if (!savedRecipe) return
    setApproving(true)
    setSaveMsg(null)
    try {
      const supabase = createClient()
      const profile = useUserStore.getState().profile
      const { error } = await (supabase.from('recipes') as any)
        .update({
          is_approved: true,
          approved_by: profile?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', savedRecipe.id)
      if (error) throw error
      setSavedRecipe({ ...savedRecipe, is_approved: true, approved_by: profile?.id ?? null, approved_at: new Date().toISOString() })
      setSaveMsg({ ok: true, text: 'تم اعتماد الوصفة ✓' })
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setApproving(false)
    }
  }

  async function handleDeleteVersion() {
    if (!savedRecipe || !currentProduct) return
    if (!window.confirm(`هل تريد حذف إصدار ${savedRecipe.version}؟ لا يمكن التراجع.`)) return
    setDeleting(true)
    setSaveMsg(null)
    try {
      const supabase = createClient()
      await (supabase.from('recipe_ingredients') as any).delete().eq('recipe_id', savedRecipe.id)
      const { error } = await (supabase.from('recipes') as any).delete().eq('id', savedRecipe.id)
      if (error) throw error

      qc.bustPrefix(cacheKey.recipes(brand as string))
      qc.bustPrefix(cacheKey.batchRecipes(brand as string))
      await loadVersions()

      // بعد الحذف: حمّل الإصدار النشط إن وجد، وإلا أعد التهيئة
      const remaining = versions.filter(v => v.id !== savedRecipe.id)
      if (remaining.length > 0) {
        const active = remaining.find(v => v.is_active) ?? remaining[0]
        await loadRecipe(active.id)
      } else {
        setSavedRecipe(null)
        setRows([])
        setSellPrice(currentProduct.price)
        setAppPrice(currentProduct.app_price)
        setYieldPortions(1)
        setDirty(false)
      }
      setSaveMsg({ ok: true, text: 'تم حذف الإصدار ✓' })
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave() {
    if (!currentProduct) return

    // Block save if current period is closed
    if (isCurrentClosed) {
      setSaveMsg({ ok: false, text: `فترة ${formatYearMonth(currentYM)} مغلقة — لا يمكن الحفظ` })
      return
    }

    setSaving(true)
    setSaveMsg(null)
    try {
      const supabase = createClient()
      const profile = useUserStore.getState().profile

      const recipePayload = {
        product_name: currentProduct.name,
        is_semi: currentProduct.is_semi,
        sell_price: sellPrice,
        app_price: appPrice,
        yield_portions: yieldPortions,
        total_cost: diResult.totalCost,
        food_cost_pct: diResult.foodCostPct,
        margin: diResult.margin,
        margin_app: diResult.marginApp,
        dine_out_total_cost: doResult.totalCost,
        dine_out_food_cost_pct: doResult.foodCostPct,
        dine_out_margin: doResult.margin,
        saved_by: profile?.id ?? null,
        saved_at: new Date().toISOString(),
      }

      let saved: any
      if (savedRecipe?.id) {
        // Update existing version by ID
        const { data, error: recErr } = await (supabase.from('recipes') as any)
          .update(recipePayload)
          .eq('id', savedRecipe.id)
          .select()
          .single()
        if (recErr) throw recErr
        saved = data
      } else {
        // First save for this product — insert as version 1, active
        const { data, error: recErr } = await (supabase.from('recipes') as any)
          .insert({
            sku: currentProduct.sku,
            brand_id: brand as string,
            version: 1,
            is_active: true,
            version_name: null,
            ...recipePayload,
          })
          .select()
          .single()
        if (recErr) throw recErr
        saved = data
      }

      await (supabase.from('recipe_ingredients') as any)
        .delete()
        .eq('recipe_id', saved.id)

      if (rows.length > 0) {
        const { error: ingErr } = await (supabase.from('recipe_ingredients') as any).insert(
          rows.map((r, i) => ({
            recipe_id: saved.id,
            ing_sku: r.ing_sku,
            ing_name: r.ing_name,
            qty: r.qty,
            unit: r.unit,
            unit_cost: r.unit_cost,
            yield_pct: r.yield_pct,
            is_semi: r.is_semi,
            section: r.section,
            service_type: r.service_type,
            sort_order: i,
          })),
        )
        if (ingErr) throw ingErr
      }

      const appFcPct = appPrice && appPrice > 0
        ? (diResult.perPortionCost / (appPrice / VAT_RATE)) * 100
        : null

      await (supabase.from('audit_logs') as any).insert({
        brand_id: brand as string,
        action: 'recipe_saved',
        entity_type: 'recipe',
        entity_sku: currentProduct.sku,
        entity_name: currentProduct.name,
        performed_by: profile?.id ?? null,
        metadata: {
          di_food_cost_pct: diResult.foodCostPct,
          do_food_cost_pct: doResult.foodCostPct,
          app_food_cost_pct: appFcPct,
          total_cost: diResult.totalCost,
        },
      })

      setSavedRecipe(saved as Recipe)
      // Invalidate cached recipes list so sidebar + dashboard reflect the new save
      qc.bustPrefix(cacheKey.recipes(brand as string))
      qc.bustPrefix(cacheKey.ingPrices(brand as string))
      await loadVersions()
      setSaveMsg({ ok: true, text: 'تم الحفظ ✓' })
      setDirty(false)
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePriceOnly() {
    if (!currentProduct) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const supabase = createClient()
      await (supabase.from('products') as any)
        .update({ price: sellPrice, app_price: appPrice })
        .eq('sku', currentProduct.sku)
        .eq('brand_id', brand as string)
      setSaveMsg({ ok: true, text: '✓ تم تحديث سعر البيع' })
      setDirty(false)
    } catch (e: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  function printService(mode: 'di' | 'do' | 'kitchen') {
    document.body.dataset.printMode = mode
    window.print()
    delete document.body.dataset.printMode
  }

  function handleExportRecipe() {
    if (!currentProduct || rows.length === 0) return
    const headers = ['المكوّن', 'SKU', 'النوع', 'الوحدة', 'الكمية', 'Yield%', 'سعر الوحدة', 'الإجمالي', 'القسم', 'نوع الخدمة']
    const csvRows = rows.map(r => {
      const total = r.yield_pct > 0 ? (r.qty / (r.yield_pct / 100)) * r.unit_cost : 0
      return [
        r.ing_name, r.ing_sku,
        r.is_semi ? 'باتش' : 'مادة خام',
        r.unit, r.qty, r.yield_pct,
        r.unit_cost.toFixed(6), total.toFixed(4),
        r.section, r.service_type,
      ]
    })
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recipe-${currentProduct.sku}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── empty states ──────────────────────────────────────────────
  if (!currentProduct) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-3xl">
            📋
          </div>
          <p className="text-gray-500 text-sm">اختر منتجاً من القائمة</p>
          <p className="text-gray-400 text-xs">لعرض الوصفة وبدء التكلفة</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  const ingSkus = [...new Set(rows.map(r => r.ing_sku))]

  // ── simplified view for users without price visibility ──
  if (!canSeeP) {
    return (
      <SimpleRecipeView
        productName={currentProduct.name}
        sku={currentProduct.sku}
        isSemi={!!currentProduct.is_semi}
        yieldPortions={yieldPortions}
        brandName={brand === 'ti' ? 'Three In' : 'باب البلد'}
        version={savedRecipe?.version ?? null}
        isApproved={savedRecipe?.is_approved ?? false}
        foodRows={foodRows}
        diPackaging={diPackaging}
        doPackaging={doPackaging}
        activeService={activeService}
        onServiceChange={setActiveService}
        canEdit={canE}
        onQtyChange={(id, qty) => { updateRow(id, { qty }); setDirty(true) }}
        onSave={handleSave}
        saving={saving}
        dirty={dirty}
        saveMsg={saveMsg}
      />
    )
  }

  // ── accountant full editor ────────────────────────────────────
  const activeDiPct = rows.length > 0 ? diResult.foodCostPct : null

  return (
    <>
      {/* ── Print view (full — with prices) ─────────── */}
      <div className="hidden print:block print-full-view" style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", direction: 'rtl', color: '#111', fontSize: '11px' }}>

        {/* Header */}
        <div style={{ background: '#1a3a4a', color: 'white', padding: '12px 20px', marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>Recipe Card — بطاقة وصفة</div>
            <div style={{ fontSize: '20px', fontWeight: '700', lineHeight: 1.2 }}>{currentProduct.name}</div>
            <div style={{ fontSize: '9px', opacity: 0.65, fontFamily: 'monospace', marginTop: '3px' }}>
              {currentProduct.sku}
              {savedRecipe?.version ? `  ·  إصدار ${savedRecipe.version}` : ''}
              {savedRecipe?.is_approved ? '  ·  معتمدة ✓' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: '700' }}>{brand === 'ti' ? 'Three In' : 'باب البلد'}</div>
            {(profile?.name_ar || profile?.username) && (
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '3px' }}>
                {profile?.name_ar || profile?.username}
              </div>
            )}
            <div style={{ fontSize: '9px', opacity: 0.6, marginTop: '3px' }}>
              {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(to left, #2d6a4f, #1b4f72, #c85a1e)', marginBottom: '14px' }} />

        {/* Identity row */}
        <div style={{ display: 'grid', gridTemplateColumns: canSeeP && !currentProduct.is_semi ? '1fr 1fr 1fr' : '1fr 1fr', border: '1px solid #e2e4e8', marginBottom: '12px' }}>
          <div style={{ padding: '8px 14px', borderLeft: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '8px', color: '#9098a8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '2px' }}>النوع</div>
            <div style={{ fontWeight: '700' }}>{currentProduct.is_semi ? 'Batch — منتج وسيط' : 'Meal — وجبة'}</div>
          </div>
          <div style={{ padding: '8px 14px', borderLeft: canSeeP && !currentProduct.is_semi ? '1px solid #e5e7eb' : undefined }}>
            <div style={{ fontSize: '8px', color: '#9098a8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '2px' }}>عدد {currentProduct.is_semi ? 'الوحدات' : 'الحصص'}</div>
            <div style={{ fontWeight: '700', fontFamily: 'monospace', fontSize: '16px' }}>{yieldPortions}</div>
          </div>
          {canSeeP && !currentProduct.is_semi && (
            <div style={{ padding: '8px 14px' }}>
              <div style={{ fontSize: '8px', color: '#9098a8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '2px' }}>سعر البيع</div>
              <div style={{ fontWeight: '700', fontFamily: 'monospace', fontSize: '16px' }}>{sellPrice.toFixed(2)} <span style={{ fontSize: '10px', fontWeight: '400' }}>ر.س</span></div>
            </div>
          )}
        </div>

        {/* KPI — DI */}
        {canSeeP && rows.length > 0 && !currentProduct.is_semi && (
          <div className="print-di-only" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid #e2e4e8' }}>
              <PrintKpi label="Food Cost % — DI" value={`${diResult.foodCostPct.toFixed(1)}%`} alert={diResult.foodCostPct > 35} />
              <PrintKpi label="تكلفة الحصة — DI" value={`${diResult.perPortionCost.toFixed(3)} ر.س`} />
              <PrintKpi label="هامش الربح — DI" value={`${diResult.margin.toFixed(2)} ر.س`} good />
              <PrintKpi label="إجمالي التكلفة" value={`${diResult.totalCost.toFixed(3)} ر.س`} />
            </div>
          </div>
        )}

        {/* KPI — DO */}
        {canSeeP && rows.length > 0 && !currentProduct.is_semi && doPackaging.length > 0 && (
          <div className="print-do-only" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid #e2e4e8' }}>
              <PrintKpi label="Food Cost % — DO" value={`${doResult.foodCostPct.toFixed(1)}%`} alert={doResult.foodCostPct > 35} />
              <PrintKpi label="تكلفة الحصة — DO" value={`${doResult.perPortionCost.toFixed(3)} ر.س`} />
              <PrintKpi label="هامش الربح — DO" value={`${doResult.margin.toFixed(2)} ر.س`} good />
              <PrintKpi label="إجمالي التكلفة" value={`${doResult.totalCost.toFixed(3)} ر.س`} />
            </div>
          </div>
        )}

        {/* Food table */}
        {foodRows.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2d6a4f', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2d6a4f', display: 'inline-block' }} />
              Food Items — المواد الغذائية
            </div>
            <PrintTable rows={foodRows} canSeeP={canSeeP} />
          </div>
        )}

        {/* DI packaging */}
        <div className="print-di-only">
          {diPackaging.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1b4f72', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b4f72', display: 'inline-block' }} />
                Packaging — Dine In
              </div>
              <PrintTable rows={diPackaging} canSeeP={canSeeP} />
            </div>
          )}
        </div>

        {/* DO packaging */}
        <div className="print-do-only">
          {doPackaging.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c85a1e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c85a1e', display: 'inline-block' }} />
                Packaging — Dine Out
              </div>
              <PrintTable rows={doPackaging} canSeeP={canSeeP} />
            </div>
          )}
        </div>

        {/* Cost breakdown bar */}
        {canSeeP && rows.length > 0 && !currentProduct.is_semi && (
          <>
            <div className="print-di-only">
              <PrintCostBar
                foodCost={foodRows.reduce((s, r) => s + (r.qty / (r.yield_pct / 100)) * r.unit_cost, 0) / yieldPortions}
                pkgCost={diPackaging.reduce((s, r) => s + (r.qty / (r.yield_pct / 100)) * r.unit_cost, 0) / yieldPortions}
                sellPrice={sellPrice}
                label="Dine In"
              />
            </div>
            <div className="print-do-only">
              <PrintCostBar
                foodCost={foodRows.reduce((s, r) => s + (r.qty / (r.yield_pct / 100)) * r.unit_cost, 0) / yieldPortions}
                pkgCost={doPackaging.reduce((s, r) => s + (r.qty / (r.yield_pct / 100)) * r.unit_cost, 0) / yieldPortions}
                sellPrice={sellPrice}
                label="Dine Out"
              />
            </div>
          </>
        )}

        {/* Charts — DI (food + DI packaging together, no nested class) */}
        {rows.length > 0 && (
          <div className="print-di-only" style={{ marginBottom: '14px', pageBreakInside: 'avoid' }}>
            <div style={{ display: 'flex', gap: '0', border: '1px solid #e2e4e8', background: '#f9fafb' }}>
              <div style={{ flex: 1, padding: '14px 16px', borderLeft: '1px solid #e2e4e8' }}>
                <PrintDonut
                  title="تركيبة المواد الغذائية"
                  slices={foodRows.map((r, i) => ({
                    label: r.ing_name,
                    value: (r.qty / (r.yield_pct / 100)) * r.unit_cost,
                    color: PRINT_PALETTE_FOOD[i % PRINT_PALETTE_FOOD.length],
                  }))}
                />
              </div>
              <div style={{ flex: 1, padding: '14px 16px' }}>
                <PrintDonut
                  title="تغليف — Dine In"
                  slices={diPackaging.map((r, i) => ({
                    label: r.ing_name,
                    value: (r.qty / (r.yield_pct / 100)) * r.unit_cost,
                    color: PRINT_PALETTE_PKG_DI[i % PRINT_PALETTE_PKG_DI.length],
                  }))}
                  empty="لا يوجد تغليف"
                />
              </div>
            </div>
          </div>
        )}

        {/* Charts — DO (food + DO packaging together, no nested class) */}
        {rows.length > 0 && (
          <div className="print-do-only" style={{ marginBottom: '14px', pageBreakInside: 'avoid' }}>
            <div style={{ display: 'flex', gap: '0', border: '1px solid #e2e4e8', background: '#f9fafb' }}>
              <div style={{ flex: 1, padding: '14px 16px', borderLeft: '1px solid #e2e4e8' }}>
                <PrintDonut
                  title="تركيبة المواد الغذائية"
                  slices={foodRows.map((r, i) => ({
                    label: r.ing_name,
                    value: (r.qty / (r.yield_pct / 100)) * r.unit_cost,
                    color: PRINT_PALETTE_FOOD[i % PRINT_PALETTE_FOOD.length],
                  }))}
                />
              </div>
              <div style={{ flex: 1, padding: '14px 16px' }}>
                <PrintDonut
                  title="تغليف — Dine Out"
                  slices={doPackaging.map((r, i) => ({
                    label: r.ing_name,
                    value: (r.qty / (r.yield_pct / 100)) * r.unit_cost,
                    color: PRINT_PALETTE_PKG_DO[i % PRINT_PALETTE_PKG_DO.length],
                  }))}
                  empty="لا يوجد تغليف"
                />
              </div>
            </div>
          </div>
        )}

        {/* Signature */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', paddingTop: '14px', borderTop: '1px solid #e5e7eb', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#9098a8', marginBottom: '24px' }}>أعدّها</div>
            <div style={{ borderBottom: '1px solid #9ca3af' }} />
            <div style={{ fontSize: '9px', color: '#9098a8', marginTop: '4px' }}>الاسم / التوقيع / التاريخ</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#9098a8', marginBottom: '24px' }}>
              اعتمدها{savedRecipe?.is_approved ? ' ✓' : ''}
            </div>
            <div style={{ borderBottom: '1px solid #9ca3af' }} />
            <div style={{ fontSize: '9px', color: '#9098a8', marginTop: '4px' }}>الاسم / التوقيع / التاريخ</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ paddingTop: '6px', borderTop: '1px solid #f0f1f3', fontSize: '8px', color: '#b0b8c4', display: 'flex', justifyContent: 'space-between' }}>
          <span>Recipe Analytics — نظام تكاليف الوصفات</span>
          <span>{new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* ── Kitchen print view (no prices) ──────────── */}
      <div className="hidden print-kitchen-view" style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", direction: 'rtl', color: '#111', fontSize: '11px' }}>
        <KitchenPrintView
          productName={currentProduct.name}
          sku={currentProduct.sku}
          isSemi={!!currentProduct.is_semi}
          yieldPortions={yieldPortions}
          brandName={brand === 'ti' ? 'Three In' : 'باب البلد'}
          version={savedRecipe?.version ?? null}
          isApproved={savedRecipe?.is_approved ?? false}
          foodRows={foodRows}
          diPackaging={diPackaging}
          doPackaging={doPackaging}
        />
      </div>

      {/* ── Screen view ─────────────────────────────── */}
      <div className="print:hidden flex flex-col h-full overflow-hidden">

        {/* ── Header bar ─────────────────────────────── */}
        <div
          className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 border-r-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderRightColor: fcAccentColor(activeDiPct) }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-mono">{currentProduct.sku}</span>

            {/* Period lock badge */}
            {isCurrentClosed && (
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                🔒 {formatYearMonth(currentYM)} مغلقة
              </span>
            )}

            {/* Version badge */}
            {versions.length > 0 && savedRecipe && (() => {
              const currentV = versions.find(v => v.id === savedRecipe.id)
              return currentV ? (
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                  currentV.is_active
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : currentV.is_approved
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {currentV.is_active ? '✓' : currentV.is_approved ? '◎' : '○'} إصدار {currentV.version}
                  {!currentV.is_active && (currentV.is_approved ? ' — بانتظار التفعيل' : ' — بانتظار الاعتماد')}
                </span>
              ) : null
            })()}

            {dirty && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                تعديلات غير محفوظة
              </span>
            )}
            {!dirty && saveMsg?.ok && (
              <span className="text-xs text-green-600">{saveMsg.text}</span>
            )}
            {saveMsg && !saveMsg.ok && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">{saveMsg.text}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Version switcher */}
            {versions.length > 1 && (
              <select
                value={savedRecipe?.id ?? ''}
                onChange={e => {
                  const v = versions.find(x => x.id === e.target.value)
                  if (v) loadRecipe(v.id)
                }}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-500"
              >
                {versions.map(v => (
                  <option key={v.id} value={v.id}>
                    إصدار {v.version}
                    {v.is_active ? ' ● فعّال' : ''}
                    {v.is_approved ? ' ✓ معتمد' : ' ◌ غير معتمد'}
                    {v.version_name ? ` — ${v.version_name}` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Delete version button — only for non-approved versions */}
            {canE && savedRecipe && !isApproved && (
              <button
                onClick={handleDeleteVersion}
                disabled={deleting || saving}
                className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? '...' : '🗑 حذف'}
              </button>
            )}

            {/* Approve button — shown after save, accountant only, not yet approved */}
            {canApprove && savedRecipe && !isApproved && !dirty && (
              <button
                onClick={handleApprove}
                disabled={approving || saving}
                className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {approving ? '...' : '✓ اعتماد'}
              </button>
            )}

            {/* Approved badge */}
            {isApproved && (
              <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                ✓ معتمدة
              </span>
            )}

            {/* Activate button — only approved inactive versions can be activated */}
            {savedRecipe && versions.find(v => v.id === savedRecipe.id && !v.is_active && v.is_approved) && canE && (
              <button
                onClick={handleActivate}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                ✓ تفعيل هذا الإصدار
              </button>
            )}

            {/* New Version button */}
            {savedRecipe && canE && !isCurrentClosed && !isApproved && (
              <button
                onClick={handleNewVersion}
                disabled={creatingVersion || saving}
                className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {creatingVersion ? '...' : '+ وصفة جديدة للمنتج'}
              </button>
            )}

            <button
              onClick={() => setShowHistory(true)}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            >
              📊 السجل
            </button>
            {versions.length >= 2 && (
              <button
                onClick={() => setShowVersionDiff(true)}
                className="text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors"
              >
                ⇄ مقارنة الإصدارات
              </button>
            )}
            <button
              onClick={() => printService('di')}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            >
              🖨 Dine In
            </button>
            <button
              onClick={() => printService('do')}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            >
              🖨 Dine Out
            </button>
            {savedRecipe && rows.length > 0 && (
              <button
                onClick={() => printService('kitchen')}
                className="text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition-colors"
              >
                🍽 مطبخ
              </button>
            )}
            {rows.length > 0 && (
              <button
                onClick={handleExportRecipe}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
              >
                ↓ تصدير المكونات
              </button>
            )}
            {isMgmt && savedRecipe && (
              <button
                onClick={handleSavePriceOnly}
                disabled={saving || !dirty}
                className="text-xs px-4 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-40 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {saving ? '...' : '💾 حفظ السعر'}
              </button>
            )}
            {canEditRecipe && (
              <button
                onClick={handleSave}
                disabled={saving || rows.length === 0 || isCurrentClosed}
                title={isCurrentClosed ? 'الفترة مغلقة' : undefined}
                className={`text-xs px-4 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-40 ${
                  isCurrentClosed
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : dirty && rows.length > 0
                    ? 'bg-blue-500 hover:bg-blue-400 text-white ring-2 ring-blue-400/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {saving ? '...' : isCurrentClosed ? '🔒 مغلق' : '💾 حفظ'}
              </button>
            )}
          </div>
        </div>

        {/* ── Approved banner ─────────────────────────── */}
        {isApproved && (
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2.5 bg-emerald-50 border-b border-emerald-200">
            <span className="text-lg">✓</span>
            <div>
              <span className="text-sm font-semibold text-emerald-800">هذه الوصفة معتمدة — للقراءة فقط</span>
              <span className="text-xs text-emerald-600 mr-2">لا يمكن تعديلها أو حذف مكوناتها</span>
            </div>
          </div>
        )}

        {/* ── Inactive version banner ─────────────────── */}
        {savedRecipe && versions.length > 0 && (() => {
          const current = versions.find(v => v.id === savedRecipe.id)
          if (!current || current.is_active) return null
          return (
            <div className={`flex-shrink-0 flex items-center justify-between gap-4 px-5 py-2.5 border-b ${
              current.is_approved
                ? 'bg-blue-50 border-blue-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className={`flex items-center gap-2 text-sm ${current.is_approved ? 'text-blue-800' : 'text-amber-800'}`}>
                <span>{current.is_approved ? '◎' : '○'}</span>
                <span>
                  أنت تشاهد <strong>إصدار {current.version}</strong>
                  {current.is_approved
                    ? ' — معتمد، غير فعّال حالياً'
                    : ' — غير معتمد ولا يمكن تفعيله'}
                </span>
              </div>
              {current.is_approved ? (
                canE && (
                  <button
                    onClick={handleActivate}
                    disabled={saving}
                    className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {saving ? '...' : '✓ اجعله الإصدار الفعّال'}
                  </button>
                )
              ) : (
                <span className="text-xs text-amber-700 bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg flex-shrink-0">
                  اعتمد الوصفة أولاً للتفعيل
                </span>
              )}
            </div>
          )
        })()}

        {/* ── Scrollable content ──────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

          {/* 1. Identity card */}
          <RecipeIdentityCard
            product={currentProduct}
            diResult={diResult}
            doResult={doResult}
            sellPrice={sellPrice}
            appPrice={appPrice}
            yieldPortions={yieldPortions}
            canEdit={canEditRecipe}
            canEditPrice={canEditRecipe || isMgmt}
            onSellPriceChange={v => { setSellPrice(v); setDirty(true) }}
            onAppPriceChange={v => { setAppPrice(v); setDirty(true) }}
            onYieldChange={v => { setYieldPortions(v); setDirty(true) }}
            hasDoPackaging={doPackaging.length > 0}
          />

          {/* 2. Cost breakdown bar */}
          <RecipeCostBar
            foodRows={foodRows}
            diPackaging={diPackaging}
            doPackaging={doPackaging}
            yieldPortions={yieldPortions}
            sellPrice={sellPrice}
          />

          {/* 3. Food table */}
          <RecipeFoodTable
            rows={foodRows}
            canEdit={canEditRecipe}
            canSeePrices={canSeeP}
            onQtyChange={(id, qty) => handleRowChange(id, { qty })}
            onYieldChange={(id, yield_pct) => handleRowChange(id, { yield_pct })}
            onDelete={handleRowDelete}
            onAdd={handleAddFood}
          />

          {/* 4. Package table */}
          <RecipePackageTable
            diRows={diPackaging}
            doRows={doPackaging}
            canEdit={canEditRecipe}
            canSeePrices={canSeeP}
            onQtyChange={(id, qty) => handleRowChange(id, { qty })}
            onDelete={handleRowDelete}
            onAddDI={item => handleAddPackaging(item, 'dine_in')}
            onAddDO={item => handleAddPackaging(item, 'dine_out')}
          />

          {/* 5. Charts */}
          <RecipeChartsRow
            foodRows={foodRows}
            diPackaging={diPackaging}
            doPackaging={doPackaging}
          />

          {/* 6. Price history */}
          <RecipePriceHistory
            sku={currentProduct.sku}
            brand={brand as import('@/types').BrandId}
          />
        </div>
      </div>

      <RecipeHistory
        open={showHistory}
        onClose={() => setShowHistory(false)}
        sku={currentProduct.sku}
        brand={brand as import('@/types').BrandId}
        ingSkus={ingSkus}
      />

      <RecipeVersionDiff
        open={showVersionDiff}
        onClose={() => setShowVersionDiff(false)}
        versions={versions as any}
        brand={brand as import('@/types').BrandId}
        productName={currentProduct.name}
      />

    </>
  )
}

// ── PrintKpi ──────────────────────────────────────────────────────

function PrintKpi({ label, value, alert, good }: { label: string; value: string; alert?: boolean; good?: boolean }) {
  return (
    <div style={{ padding: '8px 12px', borderLeft: '1px solid #e2e4e8', background: alert ? '#fef2f2' : good ? '#f0fdf4' : 'white', borderTop: alert ? '2px solid #ef4444' : good ? '2px solid #16a34a' : '2px solid #1a3a4a' }}>
      <div style={{ fontSize: '8px', color: '#9098a8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '15px', fontFamily: '"Courier New", monospace', fontWeight: '700', color: alert ? '#dc2626' : good ? '#16a34a' : '#1a3a4a' }}>
        {value}
      </div>
    </div>
  )
}

// ── PrintTable ────────────────────────────────────────────────────

function PrintTable({ rows, canSeeP }: { rows: RecipeRowDraft[]; canSeeP: boolean }) {
  if (rows.length === 0) return null
  const subtotal = rows.reduce((s, r) => s + (r.qty / (r.yield_pct / 100)) * r.unit_cost, 0)
  const cols = canSeeP ? 7 : 5
  return (
    <table suppressHydrationWarning style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', border: '1px solid #e2e4e8', borderRadius: '6px', overflow: 'hidden' }}>
      <thead>
        <tr style={{ background: '#1a3a4a', color: 'white' }}>
          <th style={{ textAlign: 'right', padding: '5px 8px', fontWeight: '600', fontSize: '9px' }}>المكوّن</th>
          <th style={{ textAlign: 'center', padding: '5px 6px', width: '38px', fontWeight: '600', fontSize: '9px' }}>النوع</th>
          <th style={{ textAlign: 'center', padding: '5px 6px', width: '48px', fontWeight: '600', fontSize: '9px' }}>الوحدة</th>
          <th style={{ textAlign: 'center', padding: '5px 6px', width: '48px', fontWeight: '600', fontSize: '9px' }}>الكمية</th>
          <th style={{ textAlign: 'center', padding: '5px 6px', width: '48px', fontWeight: '600', fontSize: '9px' }}>Yield%</th>
          {canSeeP && <th style={{ textAlign: 'center', padding: '5px 6px', width: '64px', fontWeight: '600', fontSize: '9px' }}>سعر الوحدة</th>}
          {canSeeP && <th style={{ textAlign: 'center', padding: '5px 6px', width: '68px', fontWeight: '600', fontSize: '9px' }}>الإجمالي</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#f8f9fa', borderBottom: '1px solid #f0f1f3' }}>
            <td style={{ padding: '5px 8px' }}>{r.ing_name}</td>
            <td style={{ textAlign: 'center', padding: '4px 6px' }}>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: r.is_semi ? '#fdf3dc' : '#e8f0f7', color: r.is_semi ? '#9a6f1e' : '#1b4f72', fontWeight: '600' }}>
                {r.is_semi ? 'BT' : 'RM'}
              </span>
            </td>
            <td style={{ textAlign: 'center', padding: '5px 6px', color: '#6b7280' }}>{r.unit}</td>
            <td style={{ textAlign: 'center', padding: '5px 6px', fontFamily: 'monospace', fontWeight: '600' }}>{r.qty}</td>
            <td style={{ textAlign: 'center', padding: '5px 6px', fontFamily: 'monospace', color: '#6b7280' }}>{r.yield_pct}%</td>
            {canSeeP && <td style={{ textAlign: 'center', padding: '5px 6px', fontFamily: 'monospace', color: '#6b7280' }}>{r.unit_cost.toFixed(3)}</td>}
            {canSeeP && <td style={{ textAlign: 'center', padding: '5px 6px', fontFamily: 'monospace', fontWeight: '600' }}>{((r.qty / (r.yield_pct / 100)) * r.unit_cost).toFixed(3)}</td>}
          </tr>
        ))}
      </tbody>
      {canSeeP && (
        <tfoot>
          <tr style={{ background: '#f0f1f3', borderTop: '1px solid #d1d5db' }}>
            <td colSpan={cols - 1} style={{ padding: '5px 8px', fontWeight: '600' }}>المجموع</td>
            <td style={{ textAlign: 'center', padding: '5px 8px', fontFamily: 'monospace', fontWeight: '700' }}>{subtotal.toFixed(3)}</td>
          </tr>
          <tr style={{ background: '#1a3a4a', color: 'white' }}>
            <td colSpan={cols - 1} style={{ padding: '5px 8px', fontWeight: '600', fontSize: '9px' }}>الإجمالي شامل ض.ق.م 15%</td>
            <td style={{ textAlign: 'center', padding: '5px 8px', fontFamily: 'monospace', fontWeight: '700' }}>{(subtotal * VAT_RATE).toFixed(3)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

// ── PrintCostBar ──────────────────────────────────────────────────

function PrintCostBar({ foodCost, pkgCost, sellPrice, label }: {
  foodCost: number; pkgCost: number; sellPrice: number; label: string
}) {
  const total = foodCost + pkgCost
  const scale = Math.max(sellPrice, total) || 1
  const foodW  = (foodCost / scale) * 100
  const pkgW   = (pkgCost  / scale) * 100
  const marW   = sellPrice > total ? ((sellPrice - total) / scale) * 100 : 0
  return (
    <div style={{ marginBottom: '12px', padding: '10px 14px', border: '1px solid #e2e4e8', background: '#f9fafb' }}>
      <div style={{ fontSize: '9px', fontWeight: '700', color: '#374151', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Cost Breakdown — {label}
      </div>
      <div style={{ height: '18px', borderRadius: '4px', overflow: 'hidden', display: 'flex', background: '#e5e7eb' }}>
        {foodW > 0 && (
          <div style={{ width: `${foodW}%`, background: '#2d6a4f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {foodW > 10 && <span style={{ fontSize: '8px', color: 'white', fontWeight: '700' }}>{foodW.toFixed(0)}%</span>}
          </div>
        )}
        {pkgW > 0 && (
          <div style={{ width: `${pkgW}%`, background: '#1a3a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {pkgW > 10 && <span style={{ fontSize: '8px', color: 'white', fontWeight: '700' }}>{pkgW.toFixed(0)}%</span>}
          </div>
        )}
        {marW > 0 && <div style={{ width: `${marW}%`, background: '#dcfce7' }} />}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '5px', fontSize: '8px', color: '#374151' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '7px', height: '7px', background: '#2d6a4f', display: 'inline-block', borderRadius: '2px' }} />
          Food {foodCost.toFixed(3)} ر.س
        </span>
        {pkgCost > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '7px', height: '7px', background: '#1a3a4a', display: 'inline-block', borderRadius: '2px' }} />
            Pkg {pkgCost.toFixed(3)} ر.س
          </span>
        )}
        {sellPrice > total && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '7px', height: '7px', background: '#dcfce7', border: '1px solid #16a34a', display: 'inline-block', borderRadius: '2px' }} />
            Margin {(sellPrice - total).toFixed(2)} ر.س
          </span>
        )}
      </div>
    </div>
  )
}

// ── PrintDonut ────────────────────────────────────────────────────

function PrintDonut({ title, slices, empty }: {
  title: string
  slices: { label: string; value: number; color: string }[]
  empty?: string
}) {
  const total = slices.reduce((s, r) => s + r.value, 0)
  if (total <= 0) {
    return (
      <div style={{ textAlign: 'center', minWidth: '110px' }}>
        <div style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#374151', marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '20px' }}>{empty ?? '—'}</div>
      </div>
    )
  }
  const cx = 55, cy = 55, r = 44, ir = 27
  let angle = -Math.PI / 2
  const arcs = slices.map(sl => {
    const frac = sl.value / total
    const sweep = frac * 2 * Math.PI
    const end = angle + sweep
    const large = sweep > Math.PI ? 1 : 0
    const path = frac > 0.005 ? [
      `M ${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`,
      `A ${r} ${r} 0 ${large} 1 ${(cx + r * Math.cos(end)).toFixed(2)} ${(cy + r * Math.sin(end)).toFixed(2)}`,
      `L ${(cx + ir * Math.cos(end)).toFixed(2)} ${(cy + ir * Math.sin(end)).toFixed(2)}`,
      `A ${ir} ${ir} 0 ${large} 0 ${(cx + ir * Math.cos(angle)).toFixed(2)} ${(cy + ir * Math.sin(angle)).toFixed(2)}`,
      'Z',
    ].join(' ') : ''
    angle = end
    return { ...sl, path, pct: (frac * 100).toFixed(1) }
  })
  return (
    <div style={{ textAlign: 'center', minWidth: '115px' }}>
      <div style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#374151', marginBottom: '6px' }}>
        {title}
      </div>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ display: 'block', margin: '0 auto' }}>
        {arcs.map((a, i) => a.path && <path key={i} d={a.path} fill={a.color} />)}
        <circle cx={cx} cy={cy} r={ir - 1} fill="white" />
      </svg>
      <div style={{ marginTop: '6px', padding: '0 4px' }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8px', marginBottom: '2px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: a.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{a.label}</span>
            <span style={{ fontWeight: '700', fontFamily: 'monospace', color: '#111', flexShrink: 0 }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SimpleRecipeView — for ops & kitchen ─────────────────────────

interface SimpleRecipeViewProps {
  productName: string
  sku: string
  isSemi: boolean
  yieldPortions: number
  brandName: string
  version: number | null
  isApproved: boolean
  foodRows: RecipeRowDraft[]
  diPackaging: RecipeRowDraft[]
  doPackaging: RecipeRowDraft[]
  activeService: ServiceType
  onServiceChange: (s: ServiceType) => void
  canEdit: boolean
  onQtyChange: (id: string, qty: number) => void
  onSave: () => void
  saving: boolean
  dirty: boolean
  saveMsg: { ok: boolean; text: string } | null
}

function SimpleRecipeView({
  productName, sku, isSemi,
  yieldPortions, brandName, version, isApproved,
  foodRows, diPackaging, doPackaging,
  activeService, onServiceChange,
  canEdit, onQtyChange, onSave, saving, dirty, saveMsg,
}: SimpleRecipeViewProps) {
  const activePackaging = activeService === 'dine_in' ? diPackaging : doPackaging

  function handleKitchenPrint() {
    document.body.dataset.printMode = 'kitchen'
    window.print()
    delete document.body.dataset.printMode
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Kitchen print view — visible only when printing */}
      <div className="hidden print-kitchen-view" style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", direction: 'rtl', color: '#111', fontSize: '11px' }}>
        <KitchenPrintView
          productName={productName}
          sku={sku}
          isSemi={isSemi}
          yieldPortions={yieldPortions}
          brandName={brandName}
          version={version}
          isApproved={isApproved}
          foodRows={foodRows}
          diPackaging={diPackaging}
          doPackaging={doPackaging}
        />
      </div>

      <div className="print:hidden">
      <div className="px-5 pt-5 pb-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{productName}</h2>
            {isSemi && (
              <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full">
                ⚙ Batch
              </span>
            )}
          </div>
          <button
            onClick={handleKitchenPrint}
            className="text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition-colors flex-shrink-0"
          >
            🍽 طباعة المطبخ
          </button>
        </div>
        <p className="text-xs text-gray-400 font-mono mb-3">{sku}</p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
          {(['dine_in', 'dine_out'] as ServiceType[]).map(s => (
            <button
              key={s}
              onClick={() => onServiceChange(s)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeService === s
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'dine_in' ? '🍽 Dine In' : '🛵 Dine Out'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <span>🥘</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">المواد الغذائية</span>
          <span className="text-xs text-gray-400">({foodRows.length})</span>
        </div>
        {foodRows.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">لا توجد مواد غذائية</p>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
            <div className="grid grid-cols-[1fr_80px_64px] px-4 py-2 text-xs text-gray-500 font-medium border-b border-gray-200 bg-gray-50">
              <div>المكوّن</div>
              <div className="text-center">الكمية</div>
              <div className="text-center">الوحدة</div>
            </div>
            {foodRows.map((row, i) => (
              <div
                key={row.id}
                className={`grid grid-cols-[1fr_80px_64px] px-4 py-3 items-center ${i < foodRows.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div>
                  <div className="text-sm text-gray-800">{row.ing_name}</div>
                  {row.is_semi && <span className="text-[10px] text-purple-600">Batch</span>}
                </div>
                <div className="text-center">
                  {canEdit ? (
                    <input
                      type="number"
                      value={row.qty}
                      onChange={e => onQtyChange(row.id, parseFloat(e.target.value) || 0)}
                      min={0} step={0.1}
                      className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 text-center focus:outline-none focus:border-blue-500"
                    />
                  ) : (
                    <span className="text-sm font-mono text-gray-800">{row.qty}</span>
                  )}
                </div>
                <div className="text-center text-sm text-gray-500">{row.unit}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span>📦</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            التغليف — {activeService === 'dine_in' ? 'Dine In' : 'Dine Out'}
          </span>
          <span className="text-xs text-gray-400">({activePackaging.length})</span>
        </div>
        {activePackaging.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">لا يوجد تغليف</p>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
            <div className="grid grid-cols-[1fr_80px_64px] px-4 py-2 text-xs text-gray-500 font-medium border-b border-gray-200 bg-gray-50">
              <div>المكوّن</div>
              <div className="text-center">الكمية</div>
              <div className="text-center">الوحدة</div>
            </div>
            {activePackaging.map((row, i) => (
              <div
                key={row.id}
                className={`grid grid-cols-[1fr_80px_64px] px-4 py-3 items-center ${i < activePackaging.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="text-sm text-gray-800">{row.ing_name}</div>
                <div className="text-center">
                  {canEdit ? (
                    <input
                      type="number"
                      value={row.qty}
                      onChange={e => onQtyChange(row.id, parseFloat(e.target.value) || 0)}
                      min={0} step={0.1}
                      className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 text-center focus:outline-none focus:border-blue-500"
                    />
                  ) : (
                    <span className="text-sm font-mono text-gray-800">{row.qty}</span>
                  )}
                </div>
                <div className="text-center text-sm text-gray-500">{row.unit}</div>
              </div>
            ))}
          </div>
        )}

        {canEdit && dirty && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'جارٍ الحفظ...' : '💾 حفظ التعديلات'}
            </button>
            {saveMsg && (
              <span className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg.text}
              </span>
            )}
          </div>
        )}
        {saveMsg?.ok && !dirty && (
          <p className="mt-3 text-xs text-green-600">{saveMsg.text}</p>
        )}
      </div>
      </div>{/* end print:hidden */}
    </div>
  )
}

// ── KitchenPrintView — no prices ─────────────────────────────────

interface KitchenPrintViewProps {
  productName: string
  sku: string
  isSemi: boolean
  yieldPortions: number
  brandName: string
  version: number | null
  isApproved: boolean
  foodRows: RecipeRowDraft[]
  diPackaging: RecipeRowDraft[]
  doPackaging: RecipeRowDraft[]
}

function KitchenIngTable({ rows, emptyMsg }: { rows: RecipeRowDraft[]; emptyMsg?: string }) {
  if (rows.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: '10px', margin: '4px 0 10px' }}>{emptyMsg ?? 'لا يوجد'}</p>
  }
  return (
    <table suppressHydrationWarning style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', marginBottom: '12px' }}>
      <thead>
        <tr style={{ background: '#1a3a4a', color: 'white' }}>
          <th style={{ textAlign: 'right', padding: '5px 10px', fontWeight: '600' }}>المكوّن</th>
          <th style={{ textAlign: 'center', padding: '5px 8px', width: '60px', fontWeight: '600' }}>الكمية</th>
          <th style={{ textAlign: 'center', padding: '5px 8px', width: '60px', fontWeight: '600' }}>الوحدة</th>
          <th style={{ textAlign: 'center', padding: '5px 8px', width: '56px', fontWeight: '600' }}>Yield%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#f8f9fa', borderBottom: '1px solid #e5e7eb' }}>
            <td style={{ padding: '6px 10px' }}>
              {r.ing_name}
              {r.is_semi && <span style={{ fontSize: '8px', marginRight: '5px', color: '#9a6f1e', background: '#fdf3dc', padding: '1px 4px', borderRadius: '3px' }}>Batch</span>}
            </td>
            <td style={{ textAlign: 'center', padding: '6px 8px', fontFamily: 'monospace', fontWeight: '700', fontSize: '12px' }}>{r.qty}</td>
            <td style={{ textAlign: 'center', padding: '6px 8px', color: '#6b7280' }}>{r.unit}</td>
            <td style={{ textAlign: 'center', padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280' }}>{r.yield_pct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function KitchenPrintView({
  productName, sku, isSemi, yieldPortions, brandName,
  version, isApproved, foodRows, diPackaging, doPackaging,
}: KitchenPrintViewProps) {
  const hasDoOnly = doPackaging.length > 0 && (
    doPackaging.length !== diPackaging.length ||
    doPackaging.some(r => !diPackaging.find(d => d.ing_sku === r.ing_sku))
  )
  const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ background: '#14532d', color: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '8px', opacity: 0.65, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '3px' }}>
            Kitchen Card — بطاقة المطبخ
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', lineHeight: 1.2 }}>{productName}</div>
          <div style={{ fontSize: '9px', opacity: 0.65, fontFamily: 'monospace', marginTop: '3px' }}>
            {sku}{version ? `  ·  إصدار ${version}` : ''}{isApproved ? '  ·  معتمدة ✓' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '12px', fontWeight: '700' }}>{brandName}</div>
          <div style={{ fontSize: '9px', opacity: 0.7, marginTop: '3px' }}>{today}</div>
        </div>
      </div>
      <div style={{ height: '3px', background: '#22c55e', marginBottom: '14px' }} />

      {/* Info row */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '8px 14px', border: '1px solid #d1fae5', background: '#f0fdf4', borderRadius: '6px' }}>
        <div>
          <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>النوع</div>
          <div style={{ fontWeight: '700', fontSize: '12px' }}>{isSemi ? 'Batch — منتج وسيط' : 'Meal — وجبة'}</div>
        </div>
        <div>
          <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {isSemi ? 'الوحدات' : 'الحصص'}
          </div>
          <div style={{ fontWeight: '700', fontFamily: 'monospace', fontSize: '18px' }}>{yieldPortions}</div>
        </div>
      </div>

      {/* Food ingredients */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#15803d', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#15803d', display: 'inline-block' }} />
          المواد الغذائية ({foodRows.length})
        </div>
        <KitchenIngTable rows={foodRows} emptyMsg="لا توجد مواد غذائية" />
      </div>

      {/* DI Packaging */}
      {diPackaging.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1b4f72', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b4f72', display: 'inline-block' }} />
            التغليف — Dine In ({diPackaging.length})
          </div>
          <KitchenIngTable rows={diPackaging} />
        </div>
      )}

      {/* DO Packaging — only if different from DI */}
      {hasDoOnly && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c85a1e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c85a1e', display: 'inline-block' }} />
            التغليف — Dine Out ({doPackaging.length})
          </div>
          <KitchenIngTable rows={doPackaging} />
        </div>
      )}

      {/* Signature */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', paddingTop: '12px', borderTop: '1px solid #d1fae5', marginTop: '8px' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '20px' }}>تحضير بواسطة</div>
          <div style={{ borderBottom: '1px solid #9ca3af' }} />
          <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px' }}>الاسم / التاريخ</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '20px' }}>مراجعة</div>
          <div style={{ borderBottom: '1px solid #9ca3af' }} />
          <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px' }}>الاسم / التاريخ</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ paddingTop: '6px', borderTop: '1px solid #d1fae5', fontSize: '8px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <span>Kitchen Card — لا تحتوي هذه البطاقة على أي أسعار</span>
        <span>{new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}
