'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { getCurrentYearMonth, lastNMonths, formatYearMonth, monthRange } from '@/lib/period'
import type { WasteLog, OverheadCategory } from '@/types'

type WasteType = WasteLog['waste_type']
type ViewTab = 'log' | 'add'

const WASTE_LABELS: Record<WasteType, string> = {
  cancellation: 'إلغاء',
  return:       'مرتجع',
  spoilage:     'تلف',
  expiry:       'انتهاء صلاحية',
  other:        'أخرى',
}

const WASTE_COLORS: Record<WasteType, { bg: string; text: string; border: string }> = {
  cancellation: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  return:       { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  spoilage:     { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  expiry:       { bg: '#fdf4ff', text: '#9333ea', border: '#e9d5ff' },
  other:        { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
}

const WASTE_TYPES: WasteType[] = ['cancellation', 'return', 'spoilage', 'expiry', 'other']

export default function WastePage() {
  const { brand } = useBrandStore()
  const { profile, canEdit } = useUserStore()
  const canE = canEdit()
  const months = lastNMonths(12)

  const [tab, setTab]           = useState<ViewTab>('log')
  const [month, setMonth]       = useState(getCurrentYearMonth())
  const [filterType, setFilterType] = useState<WasteType | 'all'>('all')
  const [logs, setLogs]         = useState<WasteLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Add form state
  const [form, setForm] = useState({
    product_name: '',
    product_sku:  '',
    log_date:     new Date().toISOString().slice(0, 10),
    waste_type:   'spoilage' as WasteType,
    qty:          '',
    value:        '',
    reason:       '',
    was_wasted:   true,
  })
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = monthRange(month)

    let q = (supabase.from('waste_log') as any)
      .select('*')
      .eq('brand_id', brand)
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date', { ascending: false })

    if (filterType !== 'all') q = q.eq('waste_type', filterType)

    const { data } = await q
    setLogs((data as WasteLog[]) || [])
    setLoading(false)
  }, [brand, month, filterType])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا السجل؟')) return
    setDeleting(id)
    const supabase = createClient()
    await (supabase.from('waste_log') as any).delete().eq('id', id)
    setDeleting(null)
    await load()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.product_name.trim()) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const supabase = createClient()
      const { error } = await (supabase.from('waste_log') as any).insert({
        brand_id:     brand as string,
        log_date:     form.log_date,
        product_name: form.product_name.trim(),
        product_sku:  form.product_sku.trim() || null,
        waste_type:   form.waste_type,
        qty:          parseFloat(form.qty) || 0,
        value:        parseFloat(form.value) || 0,
        reason:       form.reason.trim() || null,
        was_wasted:   form.was_wasted,
        created_by:   profile?.id ?? null,
      })
      if (error) throw error
      setSaveMsg({ ok: true, text: 'تم الحفظ ✓' })
      setForm(f => ({ ...f, product_name: '', product_sku: '', qty: '', value: '', reason: '' }))
      await load()
    } catch (err: any) {
      setSaveMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // ── Aggregations ──────────────────────────────────────────────
  const totalValue  = logs.reduce((s, r) => s + r.value, 0)
  const totalQty    = logs.reduce((s, r) => s + r.qty, 0)
  const wastedCount = logs.filter(r => r.was_wasted).length

  const byType = WASTE_TYPES.reduce((acc, t) => {
    const items = logs.filter(r => r.waste_type === t)
    acc[t] = { count: items.length, value: items.reduce((s, r) => s + r.value, 0) }
    return acc
  }, {} as Record<WasteType, { count: number; value: number }>)

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white w-full'

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الهدر والفاقد</h1>
          <p className="text-gray-500 text-sm mt-0.5">إلغاءات، مرتجعات، تلف، انتهاء صلاحية</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white">
            {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">إجمالي قيمة الهدر</div>
          <div className="text-xl font-bold font-mono text-red-600">{totalValue.toFixed(2)} ر.س</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">إجمالي الكمية</div>
          <div className="text-xl font-bold font-mono text-gray-800">{totalQty.toFixed(0)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">عدد السجلات</div>
          <div className="text-xl font-bold font-mono text-gray-800">{logs.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">تم إهداره فعلياً</div>
          <div className="text-xl font-bold font-mono text-orange-600">{wastedCount}</div>
        </div>
      </div>

      {/* Type breakdown */}
      <div className="flex gap-2 flex-wrap">
        {WASTE_TYPES.filter(t => byType[t].count > 0).map(t => {
          const c = WASTE_COLORS[t]
          return (
            <div key={t} className="flex items-center gap-2 rounded-lg px-3 py-2 border text-sm"
              style={{ background: c.bg, borderColor: c.border }}>
              <span style={{ color: c.text }} className="font-medium">{WASTE_LABELS[t]}</span>
              <span style={{ color: c.text }} className="font-mono">{byType[t].count} سجل</span>
              <span className="text-gray-400">·</span>
              <span style={{ color: c.text }} className="font-mono font-semibold">{byType[t].value.toFixed(2)} ر.س</span>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTab('log')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'log' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          سجل الهدر
        </button>
        {canE && (
          <button onClick={() => setTab('add')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'add' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            + إضافة يدوي
          </button>
        )}
      </div>

      {/* ── Log Tab ───────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="space-y-3">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterType('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterType === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              الكل ({logs.length})
            </button>
            {WASTE_TYPES.map(t => {
              const c = WASTE_COLORS[t]
              const active = filterType === t
              return (
                <button key={t} onClick={() => setFilterType(t)}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={active ? { background: c.text, color: '#fff', borderColor: c.text } : { background: '#fff', color: c.text, borderColor: c.border }}>
                  {WASTE_LABELS[t]} ({byType[t].count})
                </button>
              )
            })}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3">🗑</div>
                <p className="text-gray-400 text-sm">لا توجد سجلات هدر لهذا الشهر</p>
                <p className="text-gray-300 text-xs mt-1">استورد ملف الإلغاءات من Foodics أو أضف يدوياً</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                      <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                      <th className="text-right px-4 py-3 font-medium">المنتج</th>
                      <th className="text-center px-4 py-3 font-medium">النوع</th>
                      <th className="text-right px-4 py-3 font-medium">الفرع</th>
                      <th className="text-left px-4 py-3 font-medium">الكمية</th>
                      <th className="text-left px-4 py-3 font-medium">القيمة</th>
                      <th className="text-right px-4 py-3 font-medium">السبب</th>
                      <th className="text-center px-4 py-3 font-medium">هدر</th>
                      {canE && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(r => {
                      const c = WASTE_COLORS[r.waste_type]
                      return (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.log_date}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 text-sm">{r.product_name}</div>
                            {r.product_sku && <div className="text-xs text-gray-400 font-mono">{r.product_sku}</div>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                              {WASTE_LABELS[r.waste_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{r.branch_name || '—'}</td>
                          <td className="px-4 py-3 text-left font-mono text-sm text-gray-700">{r.qty}</td>
                          <td className="px-4 py-3 text-left font-mono font-semibold"
                            style={{ color: r.value > 0 ? c.text : '#9ca3af' }}>
                            {r.value > 0 ? `${r.value.toFixed(2)} ر.س` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500 max-w-32 truncate">{r.reason || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {r.was_wasted
                              ? <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">نعم</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          {canE && (
                            <td className="px-4 py-3">
                              <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">حذف</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-600">الإجمالي</td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-gray-800">{totalQty.toFixed(0)}</td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-red-600">{totalValue.toFixed(2)} ر.س</td>
                      <td colSpan={canE ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Manual Entry ──────────────────────────────────── */}
      {tab === 'add' && canE && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl">
          <h3 className="font-semibold text-gray-900 mb-4">إضافة سجل هدر يدوي</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">اسم المنتج *</label>
                <input type="text" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="اسم المنتج أو المادة" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU</label>
                <input type="text" value={form.product_sku} onChange={e => setForm(f => ({ ...f, product_sku: e.target.value }))}
                  placeholder="sk-0001" className={inputCls} dir="ltr" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">التاريخ *</label>
                <input type="date" value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))}
                  className={inputCls} dir="ltr" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">نوع الهدر *</label>
                <select value={form.waste_type} onChange={e => setForm(f => ({ ...f, waste_type: e.target.value as WasteType }))}
                  className={inputCls}>
                  {WASTE_TYPES.map(t => <option key={t} value={t}>{WASTE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">الكمية</label>
                <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                  placeholder="0" className={inputCls} min={0} step={0.01} dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">القيمة (ريال)</label>
                <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="0.00" className={inputCls} min={0} step={0.01} dir="ltr" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">السبب</label>
              <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="سبب الهدر..." className={inputCls} />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.was_wasted} onChange={e => setForm(f => ({ ...f, was_wasted: e.target.checked }))}
                className="accent-orange-500 w-4 h-4" />
              <span className="text-sm text-gray-700">تم إهداره فعلياً (لم يُعد استخدامه)</span>
            </label>

            {saveMsg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {saveMsg.text}
              </div>
            )}

            <button type="submit" disabled={saving || !form.product_name.trim()}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 transition-colors">
              {saving ? 'جارٍ الحفظ...' : 'حفظ سجل الهدر'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
