'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { useUserStore } from '@/stores/userStore'
import { useGlobalLoading } from '@/contexts/globalLoading'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { BrandId, ModifierGroup, ModifierOption, ModifierOptionIngredient } from '@/types'
import type { ParsedModifierOption, ParsedModifierIngredient } from '@/lib/excel'

// ── Local types ───────────────────────────────────────────────────
interface IngRow { sku: string; name: string; unit: string; cost: number }

// ── Helpers ───────────────────────────────────────────────────────
const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white'
const sm  = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white'

function lineCost(qty: number, unitCost: number, yieldPct: number) {
  if (yieldPct <= 0) return 0
  return (qty / (yieldPct / 100)) * unitCost
}

function calcTotal(ings: ModifierOptionIngredient[]) {
  return ings.reduce((s, i) => s + lineCost(i.qty, i.unit_cost, i.yield_pct), 0)
}

// ── Props ─────────────────────────────────────────────────────────
interface Props {
  initialGroups: ModifierGroup[]
  brand: BrandId
}

// ── Default form states ───────────────────────────────────────────
const emptyGroup = () => ({ name: '', is_required: false, min_select: 0, max_select: 1 })
const emptyOption = () => ({ option_sku: '', name: '', price: '' })

export default function ModifiersClient({ initialGroups, brand }: Props) {
  const router = useRouter()
  const { isSuperAdmin, hasPermission } = usePermissionsStore()
  const { profile } = useUserStore()
  const { startLoading, stopLoading, updateProgress } = useGlobalLoading()

  const canView   = isSuperAdmin || hasPermission('modifiers', 'view')
  const canCreate = isSuperAdmin || hasPermission('modifiers', 'create')
  const canUpdate = isSuperAdmin || hasPermission('modifiers', 'update')
  const canDelete = isSuperAdmin || hasPermission('modifiers', 'delete')
  const canImport = isSuperAdmin || hasPermission('modifiers', 'import')
  const canExport = isSuperAdmin || hasPermission('modifiers', 'export')

  // ── Groups state ─────────────────────────────────────────────────
  const [groups, setGroups]               = useState<ModifierGroup[]>(initialGroups)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup]   = useState<ModifierGroup | null>(null)
  const [groupForm, setGroupForm]         = useState(emptyGroup())
  const [savingGroup, setSavingGroup]     = useState(false)
  const [groupErr, setGroupErr]           = useState<string | null>(null)

  // ── Options state ─────────────────────────────────────────────────
  const [optionsByGroup, setOptionsByGroup] = useState<Record<string, ModifierOption[]>>({})
  const [loadingOptions, setLoadingOptions] = useState<string | null>(null)
  const [showOptionForm, setShowOptionForm] = useState(false)
  const [editingOption, setEditingOption]   = useState<ModifierOption | null>(null)
  const [optionForm, setOptionForm]         = useState(emptyOption())
  const [savingOption, setSavingOption]     = useState(false)
  const [optionErr, setOptionErr]           = useState<string | null>(null)
  const [activeGroupForOption, setActiveGroupForOption] = useState<string | null>(null)

  // ── Ingredients modal state ───────────────────────────────────────
  const [ingModalOption, setIngModalOption]   = useState<ModifierOption | null>(null)
  const [ings, setIngs]                       = useState<ModifierOptionIngredient[]>([])
  const [loadingIngs, setLoadingIngs]         = useState(false)
  const [allIngs, setAllIngs]                 = useState<IngRow[]>([])
  const [ingSearch, setIngSearch]             = useState('')
  const [showIngDrop, setShowIngDrop]         = useState(false)
  const [ingQty, setIngQty]                   = useState('')
  const [ingYield, setIngYield]               = useState('100')
  const [selectedIng, setSelectedIng]         = useState<IngRow | null>(null)
  const [savingIng, setSavingIng]             = useState(false)
  const [ingErr, setIngErr]                   = useState<string | null>(null)

  // ── Confirm dialog ────────────────────────────────────────────────
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)

  // ── Import state ──────────────────────────────────────────────────
  const importRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] = useState<ParsedModifierOption[] | null>(null)
  const [importIngredients, setImportIngredients] = useState<ParsedModifierIngredient[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { setGroups(initialGroups) }, [initialGroups])

  // ── Load options for a group ──────────────────────────────────────
  const loadOptions = useCallback(async (groupId: string) => {
    setLoadingOptions(groupId)
    const supabase = createClient()
    const { data } = await (supabase.from('modifier_options') as any)
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order').order('created_at', { ascending: false })
    setOptionsByGroup(prev => ({ ...prev, [groupId]: data ?? [] }))
    setLoadingOptions(null)
  }, [])

  // ── Load all ingredients (for autocomplete) ───────────────────────
  const loadAllIngs = useCallback(async () => {
    if (allIngs.length > 0) return
    const supabase = createClient()
    const { data } = await (supabase.from('ingredients') as any)
      .select('sku, name, unit, cost')
      .eq('brand_id', brand)
      .order('name')
    setAllIngs(data ?? [])
  }, [brand, allIngs.length])

  // ── Load ingredients for an option ───────────────────────────────
  const loadIngs = useCallback(async (optionId: string) => {
    setLoadingIngs(true)
    const supabase = createClient()
    const { data } = await (supabase.from('modifier_option_ingredients') as any)
      .select('*')
      .eq('option_id', optionId)
      .order('sort_order').order('id')
    setIngs(data ?? [])
    setLoadingIngs(false)
  }, [])

  // ── Toggle group expand ───────────────────────────────────────────
  async function toggleGroup(groupId: string) {
    if (expandedGroupId === groupId) { setExpandedGroupId(null); return }
    setExpandedGroupId(groupId)
    if (!optionsByGroup[groupId]) await loadOptions(groupId)
  }

  // ── Group form ────────────────────────────────────────────────────
  function openGroupForm(g?: ModifierGroup) {
    setEditingGroup(g ?? null)
    setGroupForm(g ? { name: g.name, is_required: g.is_required, min_select: g.min_select, max_select: g.max_select } : emptyGroup())
    setGroupErr(null)
    setShowGroupForm(true)
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) { setGroupErr('اسم المجموعة مطلوب'); return }
    setSavingGroup(true); setGroupErr(null)
    const supabase = createClient()
    try {
      if (editingGroup) {
        const { error } = await (supabase.from('modifier_groups') as any)
          .update({ name: groupForm.name.trim(), is_required: groupForm.is_required, min_select: groupForm.min_select, max_select: groupForm.max_select })
          .eq('id', editingGroup.id)
        if (error) throw error
      } else {
        const { error } = await (supabase.from('modifier_groups') as any)
          .insert({ brand_id: brand, name: groupForm.name.trim(), is_required: groupForm.is_required, min_select: groupForm.min_select, max_select: groupForm.max_select })
        if (error) throw error
      }
      setShowGroupForm(false)
      router.refresh()
    } catch (e: any) {
      setGroupErr('خطأ في الحفظ')
    } finally { setSavingGroup(false) }
  }

  function deleteGroup(g: ModifierGroup) {
    setDlg({ msg: `حذف مجموعة "${g.name}"؟ سيُحذف كل خياراتها ومكوناتها.`, onOk: async () => {
      const supabase = createClient()
      const { error } = await (supabase.from('modifier_groups') as any).delete().eq('id', g.id)
      if (error) { setGroupErr('خطأ في الحذف — حاول مرة أخرى'); return }
      router.refresh()
    }})
  }

  // ── Option form ───────────────────────────────────────────────────
  function openOptionForm(groupId: string, opt?: ModifierOption) {
    setActiveGroupForOption(groupId)
    setEditingOption(opt ?? null)
    setOptionForm(opt ? { option_sku: opt.option_sku, name: opt.name, price: opt.price.toString() } : emptyOption())
    setOptionErr(null)
    setShowOptionForm(true)
  }

  async function saveOption() {
    if (!optionForm.name.trim()) { setOptionErr('اسم الخيار مطلوب'); return }
    if (!optionForm.option_sku.trim()) { setOptionErr('كود Foodics مطلوب'); return }
    setSavingOption(true); setOptionErr(null)
    const supabase = createClient()
    const price = parseFloat(optionForm.price) || 0
    try {
      if (editingOption) {
        const { error } = await (supabase.from('modifier_options') as any)
          .update({ option_sku: optionForm.option_sku.trim(), name: optionForm.name.trim(), price })
          .eq('id', editingOption.id)
        if (error) throw error
        if (price !== editingOption.price) {
          await (supabase.from('price_history') as any).insert({
            brand_id: brand,
            sku: editingOption.option_sku,
            item_name: editingOption.name,
            item_type: 'modifier_option',
            old_price: editingOption.price,
            new_price: price,
            changed_by: profile?.id ?? null,
          })
        }
      } else {
        const { error } = await (supabase.from('modifier_options') as any)
          .insert({ brand_id: brand, group_id: activeGroupForOption, option_sku: optionForm.option_sku.trim(), name: optionForm.name.trim(), price })
        if (error) throw error
      }
      setShowOptionForm(false)
      if (activeGroupForOption) await loadOptions(activeGroupForOption)
    } catch (e: any) {
      setOptionErr(e.message?.includes('unique') ? 'كود Foodics مستخدم مسبقاً' : 'خطأ في الحفظ')
    } finally { setSavingOption(false) }
  }

  function deleteOption(opt: ModifierOption) {
    setDlg({ msg: `حذف خيار "${opt.name}"؟`, onOk: async () => {
      const supabase = createClient()
      const { error } = await (supabase.from('modifier_options') as any).delete().eq('id', opt.id)
      if (error) { setOptionErr('خطأ في الحذف — حاول مرة أخرى'); return }
      if (opt.group_id) await loadOptions(opt.group_id)
    }})
  }

  // ── Ingredients modal ─────────────────────────────────────────────
  async function openIngModal(opt: ModifierOption) {
    setIngModalOption(opt)
    setIngSearch(''); setShowIngDrop(false)
    setSelectedIng(null); setIngQty(''); setIngYield('100')
    setIngErr(null)
    await loadAllIngs()
    await loadIngs(opt.id)
  }

  function closeIngModal() { setIngModalOption(null); setIngs([]) }

  async function addIngredient() {
    if (!selectedIng || !ingModalOption) return
    const qty = parseFloat(ingQty)
    if (!qty || qty <= 0) { setIngErr('الكمية يجب أن تكون أكبر من صفر'); return }
    const yieldPct = parseFloat(ingYield) || 100
    setSavingIng(true); setIngErr(null)
    const supabase = createClient()
    const { error } = await (supabase.from('modifier_option_ingredients') as any)
      .insert({
        option_id: ingModalOption.id,
        ing_sku: selectedIng.sku, ing_name: selectedIng.name,
        qty, unit: selectedIng.unit, unit_cost: selectedIng.cost,
        yield_pct: yieldPct,
        sort_order: ings.length,
      })
    if (error) { setIngErr('خطأ في الإضافة'); setSavingIng(false); return }
    await loadIngs(ingModalOption.id)
    await recalcOptionCost(ingModalOption.id)
    setSelectedIng(null); setIngSearch(''); setIngQty(''); setIngYield('100')
    setSavingIng(false)
  }

  async function removeIngredient(ing: ModifierOptionIngredient) {
    if (!ingModalOption) return
    const supabase = createClient()
    const { error } = await (supabase.from('modifier_option_ingredients') as any).delete().eq('id', ing.id)
    if (error) { setIngErr('خطأ في الحذف — حاول مرة أخرى'); return }
    await loadIngs(ingModalOption.id)
    await recalcOptionCost(ingModalOption.id)
  }

  async function recalcOptionCost(optionId: string) {
    const supabase = createClient()
    const { data } = await (supabase.from('modifier_option_ingredients') as any)
      .select('qty, unit_cost, yield_pct')
      .eq('option_id', optionId)
    const total = calcTotal((data ?? []) as ModifierOptionIngredient[])
    await (supabase.from('modifier_options') as any)
      .update({ total_cost: parseFloat(total.toFixed(4)) })
      .eq('id', optionId)
    if (ingModalOption?.group_id) await loadOptions(ingModalOption.group_id)
  }

  // ── Export ────────────────────────────────────────────────────────
  async function handleExport() {
    startLoading('جارٍ تصدير الإضافات...')
    try {
      const supabase = createClient()
      // Fetch all options for all groups of this brand
      const { data: opts } = await (supabase.from('modifier_options') as any)
        .select('*, modifier_groups(name, is_required, min_select, max_select)')
        .eq('brand_id', brand)
        .order('created_at')
      const options = (opts ?? []).map((o: any) => ({
        group_name:   (o.modifier_groups as any)?.name ?? '',
        is_required:  (o.modifier_groups as any)?.is_required ?? false,
        min_select:   (o.modifier_groups as any)?.min_select ?? 0,
        max_select:   (o.modifier_groups as any)?.max_select ?? 1,
        option_sku:   o.option_sku,
        option_name:  o.name,
        option_price: o.price,
        total_cost:   o.total_cost,
      }))
      // Fetch all ingredients for all options
      const optionIds = (opts ?? []).map((o: any) => o.id)
      let ings: any[] = []
      if (optionIds.length > 0) {
        const { data: ingData } = await (supabase.from('modifier_option_ingredients') as any)
          .select('*, modifier_options(option_sku, name)')
          .in('option_id', optionIds)
        ings = (ingData ?? []).map((i: any) => ({
          option_sku:  (i.modifier_options as any)?.option_sku ?? '',
          option_name: (i.modifier_options as any)?.name ?? '',
          ing_sku:     i.ing_sku,
          ing_name:    i.ing_name,
          qty:         i.qty,
          unit:        i.unit,
          yield_pct:   i.yield_pct,
          unit_cost:   i.unit_cost,
        }))
      }
      const { exportModifiersExcel } = await import('@/lib/excel')
      await exportModifiersExcel(options, ings)
    } finally {
      stopLoading()
    }
  }

  // ── Import: parse file ────────────────────────────────────────────
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportPreview(null); setImportErrors([]); setImportMsg(null)
    try {
      const { parseModifiersFile } = await import('@/lib/excel')
      const result = await parseModifiersFile(file)
      setImportPreview(result.options)
      setImportIngredients(result.ingredients)
      setImportErrors(result.errors)
    } catch (err: any) {
      setImportErrors([err.message])
    }
    e.target.value = ''
  }

  // ── Import: confirm & execute ─────────────────────────────────────
  async function handleImportConfirm() {
    if (!importPreview || importPreview.length === 0) return
    startLoading('جارٍ استيراد الإضافات...')
    setImportMsg(null)
    const supabase = createClient()

    try {
      // Step 1: Collect unique group names and upsert groups
      const uniqueGroups = new Map<string, { is_required: boolean; min_select: number; max_select: number }>()
      for (const opt of importPreview) {
        if (!uniqueGroups.has(opt.group_name)) {
          uniqueGroups.set(opt.group_name, { is_required: opt.is_required, min_select: opt.min_select, max_select: opt.max_select })
        }
      }

      updateProgress(0, importPreview.length)

      // Fetch existing groups
      const { data: existingGroups } = await (supabase.from('modifier_groups') as any)
        .select('id, name')
        .eq('brand_id', brand)
      const groupIdByName = new Map<string, string>((existingGroups ?? []).map((g: any) => [g.name, g.id]))

      // Create missing groups
      for (const [name, cfg] of uniqueGroups) {
        if (!groupIdByName.has(name)) {
          const { data: newGroup, error } = await (supabase.from('modifier_groups') as any)
            .insert({ brand_id: brand, name, ...cfg })
            .select('id')
            .single()
          if (error) throw new Error(`خطأ في إنشاء مجموعة "${name}": ${error.message}`)
          groupIdByName.set(name, newGroup.id)
        } else {
          // Update existing group config
          await (supabase.from('modifier_groups') as any)
            .update({ is_required: cfg.is_required, min_select: cfg.min_select, max_select: cfg.max_select })
            .eq('id', groupIdByName.get(name))
        }
      }

      // Step 2: Upsert options
      let processed = 0
      for (const opt of importPreview) {
        const groupId = groupIdByName.get(opt.group_name)
        if (!groupId) continue
        const { error } = await (supabase.from('modifier_options') as any)
          .upsert({
            brand_id: brand,
            group_id: groupId,
            option_sku: opt.option_sku,
            name: opt.option_name,
            price: opt.option_price,
          }, { onConflict: 'brand_id,option_sku' })
        if (error) throw new Error(`خطأ في خيار "${opt.option_sku}": ${error.message}`)
        processed++
        updateProgress(processed, importPreview.length)
      }

      // Step 3: Handle ingredients if any
      if (importIngredients.length > 0) {
        startLoading('جارٍ استيراد المكونات...')
        // Fetch option IDs by sku
        const { data: optRows } = await (supabase.from('modifier_options') as any)
          .select('id, option_sku')
          .eq('brand_id', brand)
        const optIdBySku = new Map<string, string>((optRows ?? []).map((o: any) => [o.option_sku, o.id]))

        // Fetch ingredient costs
        const ingSkus = [...new Set(importIngredients.map(i => i.ing_sku))]
        const { data: ingRows } = await (supabase.from('ingredients') as any)
          .select('sku, name, unit, cost')
          .eq('brand_id', brand)
          .in('sku', ingSkus)
        const ingMeta = new Map<string, { name: string; unit: string; cost: number }>(
          (ingRows ?? []).map((i: any) => [i.sku, { name: i.name, unit: i.unit, cost: i.cost }])
        )

        // Group ingredients by option_sku
        const ingsByOpt = new Map<string, ParsedModifierIngredient[]>()
        for (const ing of importIngredients) {
          if (!ingsByOpt.has(ing.option_sku)) ingsByOpt.set(ing.option_sku, [])
          ingsByOpt.get(ing.option_sku)!.push(ing)
        }

        let ingProcessed = 0
        const totalIngs = ingsByOpt.size
        for (const [optSku, ings] of ingsByOpt) {
          const optId = optIdBySku.get(optSku)
          if (!optId) { ingProcessed++; updateProgress(ingProcessed, totalIngs); continue }

          // Delete existing ingredients for this option
          await (supabase.from('modifier_option_ingredients') as any).delete().eq('option_id', optId)

          // Insert new ingredients
          const rows = ings
            .map((ing, idx) => {
              const meta = ingMeta.get(ing.ing_sku)
              if (!meta) return null
              return {
                option_id: optId,
                ing_sku:   ing.ing_sku,
                ing_name:  meta.name,
                qty:       ing.qty,
                unit:      meta.unit || ing.unit,
                unit_cost: meta.cost,
                yield_pct: ing.yield_pct,
                sort_order: idx,
              }
            })
            .filter(Boolean)

          if (rows.length > 0) {
            await (supabase.from('modifier_option_ingredients') as any).insert(rows)
          }

          // Recalculate total_cost
          const totalCost = rows.reduce((s: number, r: any) => {
            if (!r || r.yield_pct <= 0) return s
            return s + (r.qty / (r.yield_pct / 100)) * r.unit_cost
          }, 0)
          await (supabase.from('modifier_options') as any)
            .update({ total_cost: parseFloat(totalCost.toFixed(4)) })
            .eq('id', optId)

          ingProcessed++
          updateProgress(ingProcessed, totalIngs)
        }
      }

      setImportPreview(null)
      setImportIngredients([])
      setImportMsg({ ok: true, text: `تم استيراد ${processed} خيار بنجاح` })
      router.refresh()
    } catch (err: any) {
      setImportMsg({ ok: false, text: err.message })
    } finally {
      stopLoading()
    }
  }

  const filteredIngs = ingSearch.trim()
    ? allIngs.filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase()) || i.sku.includes(ingSearch))
    : []

  const ingTotal = calcTotal(ings)
  const optPrice = ingModalOption?.price ?? 0
  const optMargin = optPrice - ingTotal
  const optFcPct = optPrice > 0 ? (ingTotal / optPrice) * 100 : null

  // ── Render ────────────────────────────────────────────────────────
  if (!canView) return (
    <div className="p-8 text-center text-gray-500">ليس لديك صلاحية لعرض هذه الصفحة</div>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الإضافات</h1>
          <p className="text-gray-500 text-sm mt-0.5">مجموعات وخيارات إضافات الأصناف مع تكاليفها</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <button onClick={handleExport}
              className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors">
              ⬇ تصدير Excel
            </button>
          )}
          {canImport && (
            <>
              <button onClick={() => importRef.current?.click()}
                className="flex items-center gap-2 text-sm px-3 py-2 border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-lg font-medium transition-colors">
                ⬆ استيراد Excel
              </button>
              <button onClick={async () => { const { downloadModifiersTemplate } = await import('@/lib/excel'); await downloadModifiersTemplate() }}
                className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-500 rounded-lg transition-colors">
                نموذج
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            </>
          )}
          {canCreate && (
            <button onClick={() => openGroupForm()}
              className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
              + مجموعة جديدة
            </button>
          )}
        </div>
      </div>

      {/* Import message */}
      {importMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${importMsg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{importMsg.text}</span>
          <button onClick={() => setImportMsg(null)} className="text-lg leading-none opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Import preview */}
      {importPreview && (
        <div className="bg-white border border-emerald-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              معاينة الاستيراد — {importPreview.length} خيار
              {importIngredients.length > 0 && ` + ${importIngredients.length} مكوّن`}
            </h3>
            <button onClick={() => { setImportPreview(null); setImportIngredients([]); setImportErrors([]) }}
              className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>

          {importErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">تحذيرات ({importErrors.length}):</p>
              {importErrors.slice(0, 5).map((e, i) => <p key={i}>• {e}</p>)}
              {importErrors.length > 5 && <p>...و {importErrors.length - 5} تحذير آخر</p>}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500">
                  <th className="text-right py-2 px-3 font-medium">المجموعة</th>
                  <th className="text-right py-2 px-3 font-medium">كود الخيار</th>
                  <th className="text-right py-2 px-3 font-medium">الخيار</th>
                  <th className="text-left py-2 px-3 font-medium">السعر</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 50).map((opt, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">{opt.group_name}</td>
                    <td className="py-1.5 px-3 font-mono text-gray-500">{opt.option_sku}</td>
                    <td className="py-1.5 px-3 font-medium text-gray-800">{opt.option_name}</td>
                    <td className="py-1.5 px-3 text-end text-green-700">{opt.option_price > 0 ? `${opt.option_price.toFixed(2)} ر.س` : '—'}</td>
                  </tr>
                ))}
                {importPreview.length > 50 && (
                  <tr><td colSpan={4} className="py-2 px-3 text-gray-400 text-center">...و {importPreview.length - 50} خيار آخر</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={handleImportConfirm}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium">
              تأكيد الاستيراد
            </button>
            <button onClick={() => { setImportPreview(null); setImportIngredients([]); setImportErrors([]) }}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Group form */}
      {showGroupForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">{editingGroup ? 'تعديل مجموعة' : 'مجموعة جديدة'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">اسم المجموعة *</label>
              <input className={inp} value={groupForm.name} onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))}
                placeholder="مثال: اختر المشروب" />
            </div>
            <div className="flex items-center gap-6 pt-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={groupForm.is_required}
                  onChange={e => setGroupForm(p => ({ ...p, is_required: e.target.checked }))}
                  className="rounded" />
                إجباري
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الحد الأدنى للاختيار</label>
              <input type="number" min={0} className={inp} value={groupForm.min_select}
                onChange={e => setGroupForm(p => ({ ...p, min_select: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الحد الأقصى للاختيار</label>
              <input type="number" min={1} className={inp} value={groupForm.max_select}
                onChange={e => setGroupForm(p => ({ ...p, max_select: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          {groupErr && <p className="text-red-600 text-sm">{groupErr}</p>}
          <div className="flex gap-2">
            <button onClick={saveGroup} disabled={savingGroup}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50">
              {savingGroup ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setShowGroupForm(false)}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          <div className="text-3xl mb-2">➕</div>
          <p>لا توجد مجموعات إضافات بعد — أضف مجموعة للبدء</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const isExpanded = expandedGroupId === g.id
            const options = optionsByGroup[g.id] ?? []

            return (
              <div key={g.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <button className="flex items-center gap-3 flex-1 text-right" onClick={() => toggleGroup(g.id)}>
                    <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    <div>
                      <span className="font-semibold text-gray-800">{g.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {g.is_required && (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">إجباري</span>
                        )}
                        <span className="text-xs text-gray-400">
                          اختر {g.min_select}–{g.max_select === 99 ? '∞' : g.max_select}
                        </span>
                        {optionsByGroup[g.id] && (
                          <span className="text-xs text-gray-400">{optionsByGroup[g.id].length} خيار</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {canUpdate && (
                      <button onClick={() => openGroupForm(g)}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                        تعديل
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => deleteGroup(g)}
                        className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                        حذف
                      </button>
                    )}
                  </div>
                </div>

                {/* Options section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {loadingOptions === g.id ? (
                      <div className="px-5 py-4 text-sm text-gray-400">جارٍ التحميل...</div>
                    ) : (
                      <div className="p-4 space-y-2">
                        {/* Option form */}
                        {showOptionForm && activeGroupForOption === g.id && (
                          <div className="bg-white border border-blue-100 rounded-lg p-4 space-y-3 mb-3">
                            <h4 className="text-sm font-semibold text-gray-700">{editingOption ? 'تعديل خيار' : 'خيار جديد'}</h4>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">كود Foodics *</label>
                                <input className={inp} value={optionForm.option_sku}
                                  onChange={e => setOptionForm(p => ({ ...p, option_sku: e.target.value }))}
                                  placeholder="sk-0090" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">الاسم *</label>
                                <input className={inp} value={optionForm.name}
                                  onChange={e => setOptionForm(p => ({ ...p, name: e.target.value }))}
                                  placeholder="زيت زيتون" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">سعر البيع الإضافي</label>
                                <input type="number" min={0} step="0.01" className={inp} value={optionForm.price}
                                  onChange={e => setOptionForm(p => ({ ...p, price: e.target.value }))}
                                  placeholder="0 للمجاني" />
                              </div>
                            </div>
                            {optionErr && <p className="text-red-600 text-xs">{optionErr}</p>}
                            <div className="flex gap-2">
                              <button onClick={saveOption} disabled={savingOption}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg disabled:opacity-50">
                                {savingOption ? 'حفظ...' : 'حفظ'}
                              </button>
                              <button onClick={() => setShowOptionForm(false)}
                                className="px-3 py-1.5 border border-gray-200 text-xs rounded-lg hover:bg-gray-50 text-gray-600">
                                إلغاء
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Options table */}
                        {options.length > 0 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 border-b border-gray-200">
                                <th className="text-right py-2 font-medium">الخيار</th>
                                <th className="text-right py-2 font-medium">كود Foodics</th>
                                <th className="text-left py-2 font-medium">السعر</th>
                                <th className="text-left py-2 font-medium">التكلفة</th>
                                <th className="text-left py-2 font-medium">الهامش</th>
                                <th className="py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {options.map(opt => {
                                const margin = opt.price - opt.total_cost
                                const fcPct = opt.price > 0 ? (opt.total_cost / opt.price) * 100 : null
                                return (
                                  <tr key={opt.id} className="border-b border-gray-100 hover:bg-white/70">
                                    <td className="py-2 font-medium text-gray-800">{opt.name}</td>
                                    <td className="py-2 text-gray-400 font-mono text-xs">{opt.option_sku}</td>
                                    <td className="py-2 text-end font-mono text-green-700">
                                      {opt.price > 0 ? `${opt.price.toFixed(2)} ر.س` : <span className="text-gray-400">مجاني</span>}
                                    </td>
                                    <td className="py-2 text-end font-mono text-gray-600">{opt.total_cost.toFixed(4)}</td>
                                    <td className="py-2 text-end">
                                      {fcPct !== null ? (
                                        <span className={`font-mono text-xs ${fcPct <= 30 ? 'text-green-600' : fcPct <= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                                          {fcPct.toFixed(1)}%
                                        </span>
                                      ) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="py-2 text-end">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => openIngModal(opt)}
                                          className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md">
                                          مكونات
                                        </button>
                                        {canUpdate && (
                                          <button onClick={() => openOptionForm(g.id, opt)}
                                            className="text-xs px-2 py-1 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-md">
                                            تعديل
                                          </button>
                                        )}
                                        {canDelete && (
                                          <button onClick={() => deleteOption(opt)}
                                            className="text-xs px-2 py-1 border border-red-100 hover:bg-red-50 text-red-500 rounded-md">
                                            حذف
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}

                        {options.length === 0 && !showOptionForm && (
                          <p className="text-sm text-gray-400 py-2">لا توجد خيارات — أضف خياراً</p>
                        )}

                        {canCreate && !(showOptionForm && activeGroupForOption === g.id) && (
                          <button onClick={() => openOptionForm(g.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
                            + إضافة خيار
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Ingredients modal ──────────────────────────────────────── */}
      {ingModalOption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">مكونات: {ingModalOption.name}</h2>
                <p className="text-xs text-gray-400 font-mono">{ingModalOption.option_sku}</p>
              </div>
              <button onClick={closeIngModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Cost summary */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-6 text-sm">
              <div>
                <span className="text-gray-500 text-xs">التكلفة الإجمالية</span>
                <div className="font-mono font-bold text-gray-800">{ingTotal.toFixed(4)} ر.س</div>
              </div>
              {optPrice > 0 && (
                <>
                  <div>
                    <span className="text-gray-500 text-xs">السعر</span>
                    <div className="font-mono font-bold text-green-700">{optPrice.toFixed(2)} ر.س</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">الهامش</span>
                    <div className={`font-mono font-bold ${optMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {optMargin.toFixed(2)} ر.س
                    </div>
                  </div>
                  {optFcPct !== null && (
                    <div>
                      <span className="text-gray-500 text-xs">FC%</span>
                      <div className={`font-mono font-bold ${optFcPct <= 30 ? 'text-green-600' : optFcPct <= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                        {optFcPct.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Ingredients list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingIngs ? (
                <p className="text-sm text-gray-400">جارٍ التحميل...</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-right pb-2 font-medium">المادة</th>
                      <th className="text-left pb-2 font-medium">الكمية</th>
                      <th className="text-left pb-2 font-medium">الوحدة</th>
                      <th className="text-left pb-2 font-medium">Yield%</th>
                      <th className="text-left pb-2 font-medium">التكلفة</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ings.map(ing => (
                      <tr key={ing.id} className="border-b border-gray-100">
                        <td className="py-2">
                          <div className="font-medium text-gray-800">{ing.ing_name}</div>
                          <div className="text-gray-400 font-mono text-xs">{ing.ing_sku}</div>
                        </td>
                        <td className="py-2 text-end font-mono">{ing.qty}</td>
                        <td className="py-2 text-end text-gray-500">{ing.unit}</td>
                        <td className="py-2 text-end text-gray-500">{ing.yield_pct}%</td>
                        <td className="py-2 text-end font-mono text-gray-700">
                          {lineCost(ing.qty, ing.unit_cost, ing.yield_pct).toFixed(4)}
                        </td>
                        <td className="py-2 text-end">
                          {canDelete && (
                            <button onClick={() => removeIngredient(ing)}
                              className="text-xs text-red-400 hover:text-red-600">حذف</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ings.length === 0 && (
                      <tr><td colSpan={6} className="py-4 text-center text-gray-400 text-sm">لا توجد مكونات</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add ingredient row */}
            {canCreate && (
              <div className="px-6 py-4 border-t border-gray-200 space-y-3">
                <p className="text-xs font-semibold text-gray-600">إضافة مادة خام</p>
                <div className="relative">
                  <input className={inp} value={ingSearch} placeholder="ابحث عن مادة..."
                    onChange={e => { setIngSearch(e.target.value); setShowIngDrop(true); setSelectedIng(null) }}
                    onFocus={() => setShowIngDrop(true)} />
                  {showIngDrop && filteredIngs.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filteredIngs.slice(0, 20).map(i => (
                        <button key={i.sku} className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex justify-between"
                          onMouseDown={() => { setSelectedIng(i); setIngSearch(i.name); setShowIngDrop(false) }}>
                          <span>{i.name}</span>
                          <span className="text-gray-400 font-mono text-xs">{i.unit} | {i.cost.toFixed(4)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedIng && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">الكمية</label>
                      <input type="number" min={0} step="0.001" className={sm} value={ingQty}
                        onChange={e => setIngQty(e.target.value)} placeholder="0" />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Yield%</label>
                      <input type="number" min={1} max={100} className={sm} value={ingYield}
                        onChange={e => setIngYield(e.target.value)} />
                    </div>
                    <div className="w-28">
                      <label className="text-xs text-gray-500 mb-1 block">التكلفة</label>
                      <div className="font-mono text-sm text-gray-700 pt-1.5">
                        {lineCost(parseFloat(ingQty) || 0, selectedIng.cost, parseFloat(ingYield) || 100).toFixed(4)}
                      </div>
                    </div>
                    <button onClick={addIngredient} disabled={savingIng}
                      className="mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg disabled:opacity-50">
                      {savingIng ? '...' : 'إضافة'}
                    </button>
                  </div>
                )}
                {ingErr && <p className="text-red-600 text-xs">{ingErr}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}
