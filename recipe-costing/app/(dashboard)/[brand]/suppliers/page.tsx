'use client'
import type { BrandId } from '@/types'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Supplier {
  id: string
  name: string
  phone: string | null
  contact_person: string | null
  notes: string | null
  created_at: string
}

type Tab = 'list' | 'compare'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

export default function SuppliersPage() {
  const { brand } = useParams() as { brand: BrandId }
  const { canEdit } = useUserStore()
  const canE = canEdit('suppliers')

  const [tab, setTab] = useState<Tab>('list')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('suppliers') as any)
      .select('*').eq('brand_id', brand).order('name')
    setSuppliers((data || []) as Supplier[])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">إدارة الموردين</h1>
        <p className="text-gray-500 text-sm mt-0.5">{suppliers.length} مورد مسجّل</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([['list', 'قائمة الموردين'], ['compare', 'مقارنة الأسعار']] as [Tab, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">جارٍ التحميل...</div>
      ) : (
        <>
          {tab === 'list'    && <SupplierList    suppliers={suppliers} brand={brand} canE={canE} onRefresh={load} />}
          {tab === 'compare' && <PriceComparison brand={brand} />}
        </>
      )}
    </div>
  )
}

// ── Supplier List + CRUD ──────────────────────────────────────────

function SupplierList({ suppliers, brand, canE, onRefresh }: {
  suppliers: Supplier[]
  brand: string
  canE: boolean
  onRefresh: () => void
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', contact_person: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)
  const [purchaseTotals, setPurchaseTotals] = useState<Map<string, { total: number; count: number }>>(new Map())

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const since = new Date()
      since.setFullYear(since.getFullYear() - 2)
      const { data } = await (supabase.from('purchases') as any)
        .select('supplier_name, total_price')
        .eq('brand_id', brand)
        .gte('purchase_date', since.toISOString().slice(0, 10))
      if (!data) return
      const map = new Map<string, { total: number; count: number }>()
      for (const r of data as any[]) {
        const ex = map.get(r.supplier_name) ?? { total: 0, count: 0 }
        map.set(r.supplier_name, { total: ex.total + (r.total_price ?? 0), count: ex.count + 1 })
      }
      setPurchaseTotals(map)
    }
    load()
  }, [brand])

  function openNew() {
    setForm({ name: '', phone: '', contact_person: '', notes: '' })
    setEditingId('new')
  }

  function openEdit(s: Supplier) {
    setForm({ name: s.name, phone: s.phone ?? '', contact_person: s.contact_person ?? '', notes: s.notes ?? '' })
    setEditingId(s.id)
  }

  async function handleSave() {
    if (!form.name.trim()) { setMsg({ ok: false, text: 'اسم المورد مطلوب' }); return }
    setSaving(true); setMsg(null)
    const supabase = createClient()
    const payload = {
      brand_id: brand,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      contact_person: form.contact_person.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (editingId === 'new') {
      const { error } = await (supabase.from('suppliers') as any).insert(payload)
      if (error) { setMsg({ ok: false, text: error.message }); setSaving(false); return }
    } else {
      const { error } = await (supabase.from('suppliers') as any).update(payload).eq('id', editingId)
      if (error) { setMsg({ ok: false, text: error.message }); setSaving(false); return }
    }
    setSaving(false); setEditingId(null); onRefresh()
    setMsg({ ok: true, text: 'تم الحفظ ✓' })
    setTimeout(() => setMsg(null), 3000)
  }

  function handleDelete(id: string, name: string) {
    setDlg({ msg: `حذف المورد "${name}"؟`, onOk: async () => {
      const supabase = createClient()
      await (supabase.from('suppliers') as any).delete().eq('id', id)
      onRefresh()
    }})
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {canE && (
        <button onClick={openNew}
          className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">
          + إضافة مورد
        </button>
      )}

      {/* Inline form for new/edit */}
      {editingId && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="text-sm font-semibold text-gray-900">
            {editingId === 'new' ? 'مورد جديد' : 'تعديل المورد'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">اسم المورد *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls} placeholder="مثال: شركة النقاء للتوزيع" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">رقم الجوال</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inputCls} placeholder="05xxxxxxxx" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">اسم المسؤول</label>
              <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                className={inputCls} placeholder="اسم مندوب المبيعات" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">ملاحظات</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className={inputCls} placeholder="اختياري" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setEditingId(null)}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {suppliers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          لا يوجد موردون بعد — أضف أول مورد
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">اسم المورد</th>
                <th className="text-right px-4 py-3 font-medium">الجوال</th>
                <th className="text-right px-4 py-3 font-medium">المسؤول</th>
                <th className="text-center px-4 py-3 font-medium">إجمالي المشتريات</th>
                <th className="text-right px-4 py-3 font-medium">ملاحظات</th>
                {canE && <th className="px-4 py-3 font-medium text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s, i) => (
                <tr key={s.id} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.contact_person ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const pt = purchaseTotals.get(s.name)
                      return pt ? (
                        <div>
                          <span className="font-mono font-semibold text-blue-700 text-xs">{pt.total.toFixed(0)} ر.س</span>
                          <span className="text-[10px] text-gray-400 block">{pt.count} فاتورة</span>
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{s.notes ?? '—'}</td>
                  {canE && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => openEdit(s)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">تعديل</button>
                        <button onClick={() => handleDelete(s.id, s.name)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium">حذف</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-700 text-right">
                  الإجمالي الكلي للمشتريات (آخر سنتين)
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-mono font-bold text-blue-700">
                    {[...purchaseTotals.values()].reduce((s, v) => s + v.total, 0).toFixed(0)} ر.س
                  </span>
                </td>
                <td colSpan={canE ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}

// ── Price Comparison ──────────────────────────────────────────────

function PriceComparison({ brand }: { brand: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [monthsBack, setMonthsBack] = useState(12)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const since = new Date()
      since.setMonth(since.getMonth() - monthsBack)
      const sinceStr = since.toISOString().slice(0, 10)

      const { data } = await (supabase.from('purchases') as any)
        .select('ing_sku, ing_name, supplier_name, unit_cost, purchase_date')
        .eq('brand_id', brand)
        .gte('purchase_date', sinceStr)
        .order('purchase_date', { ascending: false })
        .limit(5000)
      if (!data || !data.length) { setRows([]); setLoading(false); return }

      // Group by ing_sku → supplier_name → prices
      const map = new Map<string, { name: string; unit: string; suppliers: Map<string, number[]>; lastDate: Map<string, string> }>()
      for (const r of data as any[]) {
        if (!map.has(r.ing_sku)) {
          map.set(r.ing_sku, { name: r.ing_name, unit: r.unit ?? '', suppliers: new Map(), lastDate: new Map() })
        }
        const entry = map.get(r.ing_sku)!
        if (!entry.suppliers.has(r.supplier_name)) entry.suppliers.set(r.supplier_name, [])
        entry.suppliers.get(r.supplier_name)!.push(r.unit_cost)
        if (!entry.lastDate.has(r.supplier_name)) entry.lastDate.set(r.supplier_name, r.purchase_date)
      }

      const result: any[] = []
      for (const [sku, entry] of map) {
        const supplierRows = [...entry.suppliers.entries()].map(([supplier, prices]) => {
          const sorted = [...prices].sort((a, b) => a - b)
          return {
            supplier,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
            last: prices[0],
            lastDate: entry.lastDate.get(supplier),
            count: prices.length,
          }
        }).sort((a, b) => a.avg - b.avg)

        result.push({ sku, name: entry.name, suppliers: supplierRows })
      }
      result.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      setRows(result)
      setLoading(false)
    }
    load()
  }, [brand, monthsBack])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!rows.length) return <div className="py-16 text-center text-gray-400">لا توجد بيانات مشتريات بعد</div>

  const filtered = search ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="بحث بالمادة..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-52"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[3, 6, 12].map(n => (
            <button key={n} onClick={() => setMonthsBack(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${monthsBack === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n}م
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} مادة</span>
      </div>

      <div className="space-y-3">
        {filtered.map(item => (
          <div key={item.sku} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900 text-sm">{item.name}</span>
                <span className="text-xs text-gray-400 font-mono mr-2">{item.sku}</span>
              </div>
              <span className="text-xs text-gray-400">{item.suppliers.length} مورد</span>
            </div>
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                  <th className="text-right px-4 py-2 font-medium">المورد</th>
                  <th className="text-center px-4 py-2 font-medium">أقل سعر</th>
                  <th className="text-center px-4 py-2 font-medium">أعلى سعر</th>
                  <th className="text-center px-4 py-2 font-medium">متوسط</th>
                  <th className="text-center px-4 py-2 font-medium">آخر سعر</th>
                  <th className="text-center px-4 py-2 font-medium">الطلبات</th>
                </tr>
              </thead>
              <tbody>
                {item.suppliers.map((s: any, idx: number) => {
                  const isBest = idx === 0
                  return (
                    <tr key={s.supplier} className={`border-b border-gray-50 last:border-0 ${isBest ? 'bg-green-50/40' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {isBest && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded mr-1 font-semibold">الأرخص</span>}
                        {s.supplier}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-green-600 font-semibold">{s.min.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-red-500">{s.max.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-700">{s.avg.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600">{s.last.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-400 text-xs">{s.count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
