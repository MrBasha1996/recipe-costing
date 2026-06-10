'use client'
import type { BrandId } from '@/types'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'

interface UnitConversion {
  id: string
  brand_id: string
  ing_sku: string
  ing_name: string
  buy_unit: string
  recipe_unit: string
  factor: number
  updated_at: string
}

const EMPTY_FORM = { ing_sku: '', ing_name: '', buy_unit: '', recipe_unit: '', factor: '' }

export default function ConversionsPage() {
  const { brand } = useParams() as { brand: BrandId }
  const { canEdit }      = useUserStore()
  const canE             = canEdit()

  const [rows, setRows]             = useState<UnitConversion[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [editRow, setEditRow]       = useState<UnitConversion | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('unit_conversions') as any)
      .select('*')
      .eq('brand_id', brand)
      .order('ing_name')
    setRows((data as UnitConversion[]) || [])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRow(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(r: UnitConversion) {
    setEditRow(r)
    setForm({ ing_sku: r.ing_sku, ing_name: r.ing_name, buy_unit: r.buy_unit, recipe_unit: r.recipe_unit, factor: String(r.factor) })
    setError(null)
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditRow(null) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ing_sku.trim() || !form.ing_name.trim() || !form.buy_unit.trim() || !form.recipe_unit.trim() || !form.factor) {
      setError('جميع الحقول مطلوبة'); return
    }
    const factor = parseFloat(form.factor)
    if (isNaN(factor) || factor <= 0) { setError('معامل التحويل يجب أن يكون رقماً موجباً'); return }

    setSaving(true); setError(null)
    const supabase = createClient()
    const payload = {
      brand_id: brand as string,
      ing_sku: form.ing_sku.trim(),
      ing_name: form.ing_name.trim(),
      buy_unit: form.buy_unit.trim(),
      recipe_unit: form.recipe_unit.trim(),
      factor,
      updated_at: new Date().toISOString(),
    }
    let err: any
    if (editRow) {
      const res = await (supabase.from('unit_conversions') as any).update(payload).eq('id', editRow.id)
      err = res.error
    } else {
      const res = await (supabase.from('unit_conversions') as any).insert(payload)
      err = res.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    closeForm()
    await load()
  }

  async function handleDelete(r: UnitConversion) {
    if (!confirm(`حذف تحويل "${r.ing_name}"؟`)) return
    setDeleting(r.id)
    const supabase = createClient()
    await (supabase.from('unit_conversions') as any).delete().eq('id', r.id)
    setDeleting(null)
    await load()
  }

  const filtered = rows.filter(r =>
    !search || r.ing_name.includes(search) || r.ing_sku.includes(search) ||
    r.buy_unit.includes(search) || r.recipe_unit.includes(search)
  )

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white w-full'

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">معاملات التحويل</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            تحويل وحدة الشراء إلى وحدة الوصفة — تُستخدم تلقائياً عند استيراد مشتريات Foodics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text" placeholder="بحث بالاسم أو SKU أو الوحدة..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-64 focus:outline-none focus:border-blue-500"
          />
          {canE && (
            <button onClick={openAdd}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + إضافة تحويل
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span><span className="font-semibold text-gray-800">{rows.length}</span> تحويل مسجّل</span>
        {search && <span>يظهر <span className="font-semibold text-gray-800">{filtered.length}</span></span>}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-3xl mb-3">🔄</div>
            <p className="text-gray-400 text-sm">
              {search ? 'لا توجد نتائج' : 'لا توجد تحويلات — نفّذ migration 005 أولاً'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">SKU</th>
                  <th className="text-right px-4 py-3 font-medium">اسم المادة</th>
                  <th className="text-center px-4 py-3 font-medium">وحدة الشراء</th>
                  <th className="text-center px-4 py-3 font-medium">معامل التحويل</th>
                  <th className="text-center px-4 py-3 font-medium">وحدة الوصفة</th>
                  <th className="text-center px-4 py-3 font-medium">مثال</th>
                  {canE && <th className="px-4 py-3 w-24" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.ing_sku}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.ing_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2.5 py-1 rounded-full font-medium">
                        {r.buy_unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-gray-800">
                      ÷ {r.factor.toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-1 rounded-full font-medium">
                        {r.recipe_unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">
                      1 {r.buy_unit} = {r.factor.toLocaleString('en-US')} {r.recipe_unit}
                    </td>
                    {canE && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(r)}
                            className="text-xs text-gray-500 hover:text-blue-600 transition-colors">
                            تعديل
                          </button>
                          <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
                            className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors">
                            {deleting === r.id ? '...' : 'حذف'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{editRow ? 'تعديل تحويل' : 'إضافة تحويل جديد'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU *</label>
                  <input type="text" value={form.ing_sku} onChange={e => setForm(f => ({ ...f, ing_sku: e.target.value }))}
                    placeholder="sk-0001" className={inputCls} dir="ltr" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">اسم المادة *</label>
                  <input type="text" value={form.ing_name} onChange={e => setForm(f => ({ ...f, ing_name: e.target.value }))}
                    placeholder="حليب نادك" className={inputCls} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">وحدة الشراء *</label>
                  <input type="text" value={form.buy_unit} onChange={e => setForm(f => ({ ...f, buy_unit: e.target.value }))}
                    placeholder="لتر" className={inputCls} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">معامل التحويل *</label>
                  <input type="number" value={form.factor} onChange={e => setForm(f => ({ ...f, factor: e.target.value }))}
                    placeholder="1000" className={inputCls} min={0.001} step="any" dir="ltr" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">وحدة الوصفة *</label>
                  <input type="text" value={form.recipe_unit} onChange={e => setForm(f => ({ ...f, recipe_unit: e.target.value }))}
                    placeholder="مليلتر" className={inputCls} required />
                </div>
              </div>
              {/* Preview */}
              {form.buy_unit && form.factor && form.recipe_unit && parseFloat(form.factor) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
                  1 {form.buy_unit} = {parseFloat(form.factor).toLocaleString('en-US')} {form.recipe_unit}
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">{error}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm}
                  className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  إلغاء
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg">
                  {saving ? 'جارٍ الحفظ...' : editRow ? 'تحديث' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
