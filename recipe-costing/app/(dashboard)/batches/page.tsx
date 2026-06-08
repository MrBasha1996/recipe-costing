'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { exportBatches, importBatches, downloadBatchesTemplate } from '@/lib/dataImportExport'
import type { BatchProduct, BrandId } from '@/types'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

export default function BatchesPage() {
  const { brand } = useBrandStore()
  const { canEdit } = useUserStore()
  const canE = canEdit('costing')

  const [batches, setBatches] = useState<BatchProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BatchProduct | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ sku: '', name: '', unit: 'وحدة' })

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('batches') as any)
      .select('*').eq('brand_id', brand).order('name')
    setBatches((data || []) as BatchProduct[])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditing(null)
    setForm({ sku: '', name: '', unit: 'وحدة' })
    setShowForm(true)
    setMsg(null)
  }

  function openEdit(b: BatchProduct) {
    setEditing(b)
    setForm({ sku: b.sku, name: b.name, unit: b.unit })
    setShowForm(true)
    setMsg(null)
  }

  async function handleSave() {
    if (!form.sku.trim() || !form.name.trim()) {
      setMsg({ ok: false, text: 'SKU والاسم مطلوبان' })
      return
    }
    setSaving(true)
    setMsg(null)
    const supabase = createClient()
    try {
      if (editing) {
        const { error } = await (supabase.from('batches') as any)
          .update({ name: form.name.trim(), unit: form.unit.trim() || 'وحدة' })
          .eq('sku', editing.sku).eq('brand_id', brand)
        if (error) throw error
      } else {
        const { error } = await (supabase.from('batches') as any)
          .insert({ sku: form.sku.trim(), brand_id: brand, name: form.name.trim(), unit: form.unit.trim() || 'وحدة' })
        if (error) throw error
      }
      setMsg({ ok: true, text: editing ? 'تم التعديل ✓' : 'تمت الإضافة ✓' })
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: BatchProduct) {
    if (!window.confirm(`هل تريد حذف "${b.name}"؟ سيتم حذف وصفاته أيضاً.`)) return
    const supabase = createClient()
    // Delete recipes for this batch first
    const { data: recipes } = await (supabase.from('recipes') as any)
      .select('id').eq('sku', b.sku).eq('brand_id', brand)
    for (const rec of recipes || []) {
      await (supabase.from('recipe_ingredients') as any).delete().eq('recipe_id', rec.id)
      await (supabase.from('recipes') as any).delete().eq('id', rec.id)
    }
    await (supabase.from('batches') as any).delete().eq('sku', b.sku).eq('brand_id', brand)
    await load()
  }

  async function handleExport() {
    const supabase = createClient()
    try {
      await exportBatches(brand as BrandId, supabase)
    } catch (e: any) {
      setMsg({ ok: false, text: `خطأ في التصدير: ${e.message}` })
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setMsg(null)
    const supabase = createClient()
    try {
      const result = await importBatches(file, brand as BrandId, supabase)
      const errTxt = result.errors.length > 0 ? ` | أخطاء: ${result.errors.length}` : ''
      setMsg({ ok: result.errors.length === 0, text: `مُضاف: ${result.inserted} | مُحدَّث: ${result.updated}${errTxt}` })
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setImporting(false)
    }
  }

  const filtered = batches.filter(b => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return b.name.toLowerCase().includes(q) || b.sku.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">إدارة الباتشات</h1>
          <p className="text-gray-500 text-sm mt-0.5">{batches.length} باتش مسجّل</p>
        </div>
        {canE && (
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => downloadBatchesTemplate()}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              📄 قالب
            </button>
            <button
              onClick={handleExport}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
            >
              ⬇ تصدير
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="text-sm px-3 py-1.5 border border-blue-300 bg-blue-50 rounded-lg hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50"
            >
              {importing ? 'جارٍ...' : '⬆ استيراد'}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button
              onClick={openAdd}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + إضافة باتش
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2 rounded-lg border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">{editing ? 'تعديل باتش' : 'إضافة باتش جديد'}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">SKU</label>
              <input
                className={inputCls}
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                disabled={!!editing}
                placeholder="مثال: sk-001"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الاسم</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="اسم الباتش"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الوحدة</label>
              <input
                className={inputCls}
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="وحدة / جرام / لتر..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button
              onClick={() => { setShowForm(false); setMsg(null) }}
              className="text-sm px-4 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12 text-sm">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">
            {batches.length === 0 ? 'لا يوجد باتشات بعد' : 'لا توجد نتائج'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium">SKU</th>
                <th className="text-right px-4 py-2.5 font-medium">الاسم</th>
                <th className="text-right px-4 py-2.5 font-medium">الوحدة</th>
                {canE && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(b => (
                <tr key={b.sku} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{b.sku}</td>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{b.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{b.unit}</td>
                  {canE && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(b)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
