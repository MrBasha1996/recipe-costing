'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { useUserStore } from '@/stores/userStore'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { BrandId, ModifierGroup, ModifierOption, ModifierOptionIngredient } from '@/types'

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

  const canView   = isSuperAdmin || hasPermission('modifiers', 'view')
  const canCreate = isSuperAdmin || hasPermission('modifiers', 'create')
  const canUpdate = isSuperAdmin || hasPermission('modifiers', 'update')
  const canDelete = isSuperAdmin || hasPermission('modifiers', 'delete')

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
        {canCreate && (
          <button onClick={() => openGroupForm()}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
            + مجموعة جديدة
          </button>
        )}
      </div>

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
