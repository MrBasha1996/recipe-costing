'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { lastNMonths, formatYearMonth } from '@/lib/period'
import type { Brand } from '@/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface BrandRow extends Brand {
  user_count?:  number
  closed_up_to?: string | null
}

interface FormState {
  id: string
  name: string
  name_ar: string
  fc_target_low: string
  fc_target_high: string
  logo_url: string
  primary_color: string
  sidebar_color: string
  secondary_color: string
  delivery_commission_pct: string
  is_standalone: boolean
  external_url: string
}

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  name_ar: '',
  fc_target_low: '35',
  fc_target_high: '45',
  logo_url: '',
  primary_color: '#3b82f6',
  sidebar_color: '#1c1c2e',
  secondary_color: '#8b5cf6',
  delivery_commission_pct: '0',
  is_standalone: false,
  external_url: '',
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBrand, setEditBrand] = useState<BrandRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)
  const [closeDlg, setCloseDlg] = useState<{ brand: BrandRow } | null>(null)
  const [closeMonth, setCloseMonth] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeResult, setCloseResult] = useState<Record<string, any> | null>(null)

  const { hasPermission, isSuperAdmin } = usePermissionsStore()
  const canCreate = isSuperAdmin || hasPermission('brands', 'create')
  const canUpdate = isSuperAdmin || hasPermission('brands', 'update')
  const canDelete = isSuperAdmin || hasPermission('brands', 'delete')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: brandData } = await (supabase.from('brands') as any)
      .select('id, name, name_ar, fc_target_low, fc_target_high, logo_url, primary_color, sidebar_color, secondary_color, delivery_commission_pct, closed_up_to, is_standalone, external_url')
      .order('id')

    const { data: userData } = await (supabase.from('user_profiles') as any)
      .select('brand_access')

    const userRows = (userData ?? []) as { brand_access: string }[]
    const countMap: Record<string, number> = {}
    for (const u of userRows) {
      if (u.brand_access === 'all') {
        for (const b of (brandData ?? [])) countMap[b.id] = (countMap[b.id] ?? 0) + 1
      } else {
        countMap[u.brand_access] = (countMap[u.brand_access] ?? 0) + 1
      }
    }

    setBrands((brandData ?? []).map((b: any) => ({ ...b, user_count: countMap[b.id] ?? 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditBrand(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(b: BrandRow) {
    setEditBrand(b)
    setForm({
      id: b.id,
      name: b.name,
      name_ar: b.name_ar,
      fc_target_low: String(b.fc_target_low ?? 35),
      fc_target_high: String(b.fc_target_high ?? 45),
      logo_url: b.logo_url ?? '',
      primary_color: b.primary_color ?? '#3b82f6',
      sidebar_color: (b as any).sidebar_color ?? '#1c1c2e',
      secondary_color: (b as any).secondary_color ?? '#8b5cf6',
      delivery_commission_pct: String(b.delivery_commission_pct ?? 0),
      is_standalone: b.is_standalone ?? false,
      external_url: b.external_url ?? '',
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    setError('')
    const fcLow  = parseFloat(form.fc_target_low)
    const fcHigh = parseFloat(form.fc_target_high)
    const commission = parseFloat(form.delivery_commission_pct)
    if (!form.id.trim() || !form.name.trim() || !form.name_ar.trim()) {
      setError('جميع الحقول الأساسية مطلوبة')
      return
    }
    if (isNaN(fcLow) || isNaN(fcHigh) || fcLow >= fcHigh) {
      setError('أهداف FC% غير صحيحة')
      return
    }
    if (isNaN(commission) || commission < 0 || commission > 100) {
      setError('نسبة العمولة يجب أن تكون بين 0 و100')
      return
    }
    if (form.is_standalone && !form.external_url.trim()) {
      setError('رابط النظام الخارجي مطلوب للأنظمة المستقلة')
      return
    }

    const payload: Record<string, any> = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim(),
      fc_target_low: fcLow,
      fc_target_high: fcHigh,
      primary_color: form.primary_color,
      sidebar_color: form.sidebar_color,
      secondary_color: form.secondary_color,
      delivery_commission_pct: commission,
      logo_url: form.logo_url.trim() || null,
      is_standalone: form.is_standalone,
      external_url: form.is_standalone ? form.external_url.trim() || null : null,
    }

    setSaving(true)
    const supabase = createClient()
    try {
      if (editBrand) {
        const { error: err } = await (supabase.from('brands') as any)
          .update(payload)
          .eq('id', editBrand.id)
        if (err) throw err
      } else {
        const { error: err } = await (supabase.from('brands') as any)
          .insert({ id: form.id.trim().toLowerCase(), ...payload })
        if (err) throw err
      }
      setShowForm(false)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(b: BrandRow) {
    setDlg({ msg: `حذف براند "${b.name_ar}"؟ لا يمكن الحذف إن كانت هناك بيانات مرتبطة.`, onOk: async () => {
      setDeletingId(b.id)
      const supabase = createClient()
      const { error: err } = await (supabase.from('brands') as any).delete().eq('id', b.id)
      if (err) setError('فشل الحذف: هناك بيانات مرتبطة بهذا البراند')
      else await load()
      setDeletingId(null)
    }})
  }

  function handleOpenCloseDlg(b: BrandRow) {
    const months = lastNMonths(12)
    const defaultMonth = b.closed_up_to
      ? months.find(m => m > b.closed_up_to!) ?? months[0]
      : months[0]
    setCloseMonth(defaultMonth ?? '')
    setCloseResult(null)
    setCloseDlg({ brand: b })
  }

  async function doClose() {
    if (!closeDlg || !closeMonth) return
    setClosing(true)
    setCloseResult(null)
    const supabase = createClient()
    const user = (await supabase.auth.getUser()).data.user
    const { data, error } = await (supabase as any).rpc('close_period', {
      p_brand_id:   closeDlg.brand.id,
      p_year_month: closeMonth,
      p_closed_by:  user?.id ?? null,
    })
    setClosing(false)
    if (error) {
      setCloseResult({ error: error.message })
    } else {
      setCloseResult(data as Record<string, any>)
      await load()
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500'

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">إدارة البراندات</h1>
          <p className="text-gray-500 text-sm mt-0.5">{brands.length} براند مسجّل</p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + إضافة براند
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">جارٍ التحميل...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                <th className="text-right px-4 py-3 font-medium">البراند</th>
                <th className="text-center px-4 py-3 font-medium">الرمز</th>
                <th className="text-center px-4 py-3 font-medium">النوع</th>
                <th className="text-center px-4 py-3 font-medium">اللون</th>
                <th className="text-center px-4 py-3 font-medium">هدف FC%</th>
                <th className="text-center px-4 py-3 font-medium">عمولة التوصيل</th>
                <th className="text-center px-4 py-3 font-medium">المستخدمون</th>
                <th className="text-center px-4 py-3 font-medium">الإغلاق</th>
                <th className="text-center px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {brands.map(b => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {b.logo_url ? (
                        <img src={b.logo_url} alt={b.name_ar} className="w-8 h-8 rounded-lg object-contain border border-gray-200 bg-gray-50" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: b.primary_color ?? '#3b82f6' }}>
                          {b.name_ar.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">{b.name_ar}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{b.name}</div>
                        {b.is_standalone && b.external_url && (
                          <a
                            href={b.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline mt-0.5 block font-mono"
                            onClick={e => e.stopPropagation()}
                          >
                            {b.external_url}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{b.id}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.is_standalone ? (
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        ↗ مستقل
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">متكامل</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-gray-200" style={{ backgroundColor: b.primary_color ?? '#3b82f6' }} />
                      <span className="text-xs font-mono text-gray-500">{b.primary_color ?? '#3b82f6'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">
                    {b.fc_target_low ?? 35}% – {b.fc_target_high ?? 45}%
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">
                    {b.delivery_commission_pct ?? 0}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-medium text-gray-700">{b.user_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.closed_up_to ? (
                      <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                        🔒 {formatYearMonth(b.closed_up_to)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">مفتوح</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {canUpdate && (
                        <button
                          onClick={() => openEdit(b)}
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                        >
                          تعديل
                        </button>
                      )}
                      {canUpdate && !b.is_standalone && (
                        <button
                          onClick={() => handleOpenCloseDlg(b)}
                          className="text-xs px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors"
                        >
                          🔒 إغلاق
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletingId === b.id}
                          className="text-xs px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingId === b.id ? '...' : 'حذف'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">لا توجد براندات</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editBrand ? `تعديل براند — ${editBrand.name_ar}` : 'إضافة براند جديد'}
            </h2>

            <div className="space-y-4">
              {!editBrand && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">رمز البراند (لا يتغير بعد الإنشاء)</label>
                  <input
                    value={form.id}
                    onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                    placeholder="مثال: ti, bb, xx"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">الاسم العربي</label>
                  <input
                    value={form.name_ar}
                    onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                    placeholder="باب البلد"
                    className={inputCls}
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">الاسم الإنجليزي</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Bab Al Balad"
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Colors */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">اللون الرئيسي</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.primary_color}
                        onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                        className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        value={form.primary_color}
                        onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                        placeholder="#3b82f6"
                        className={`${inputCls} font-mono flex-1`}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">لون السايدبار</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.sidebar_color}
                        onChange={e => setForm(f => ({ ...f, sidebar_color: e.target.value }))}
                        className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        value={form.sidebar_color}
                        onChange={e => setForm(f => ({ ...f, sidebar_color: e.target.value }))}
                        placeholder="#1c1c2e"
                        className={`${inputCls} font-mono flex-1`}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">اللون الثانوي</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.secondary_color}
                        onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                        className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        value={form.secondary_color}
                        onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                        placeholder="#8b5cf6"
                        className={`${inputCls} font-mono flex-1`}
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
                {/* Live preview */}
                <div className="rounded-xl overflow-hidden border border-gray-200 flex h-14">
                  <div className="w-10 flex-shrink-0" style={{ backgroundColor: form.sidebar_color }} />
                  <div className="flex-1 flex items-center px-4 gap-3" style={{ backgroundColor: form.sidebar_color }}>
                    <span className="w-1 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: form.primary_color }} />
                    <span className="text-sm font-bold" style={{ color: '#ffffff' }}>{form.name_ar || form.id || 'براند'}</span>
                    <span className="mr-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${form.secondary_color}30`, color: form.secondary_color }}>نشط</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">رابط الشعار (اختياري)</label>
                <input
                  value={form.logo_url}
                  onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://..."
                  className={inputCls}
                  dir="ltr"
                />
                {form.logo_url && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={form.logo_url} alt="معاينة" className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-gray-50" onError={e => (e.currentTarget.style.display = 'none')} />
                    <span className="text-xs text-gray-400">معاينة الشعار</span>
                  </div>
                )}
              </div>

              {/* Standalone toggle */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_standalone}
                    onChange={e => setForm(f => ({ ...f, is_standalone: e.target.checked, external_url: e.target.checked ? f.external_url : '' }))}
                    className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">نظام مستقل ↗</span>
                    <p className="text-xs text-gray-400 mt-0.5">يُفتح في تبويب خارجي بدلاً من الدخول للنظام</p>
                  </div>
                </label>

                {form.is_standalone && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">رابط النظام الخارجي</label>
                    <input
                      value={form.external_url}
                      onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))}
                      placeholder="https://..."
                      className={`${inputCls} font-mono`}
                      dir="ltr"
                    />
                  </div>
                )}
              </div>

              {/* FC Targets */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">هدف FC% الأدنى</label>
                  <input
                    type="number"
                    value={form.fc_target_low}
                    onChange={e => setForm(f => ({ ...f, fc_target_low: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">هدف FC% الأعلى</label>
                  <input
                    type="number"
                    value={form.fc_target_high}
                    onChange={e => setForm(f => ({ ...f, fc_target_high: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Delivery Commission */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">عمولة منصات التوصيل %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.delivery_commission_pct}
                  onChange={e => setForm(f => ({ ...f, delivery_commission_pct: e.target.value }))}
                  className={inputCls}
                />
                <p className="text-xs text-gray-400 mt-1">تُحسب تلقائياً من الإيراد في تقرير P&L</p>
              </div>
            </div>

            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Close Period Modal ──────────────────────────────────────── */}
      {closeDlg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">إغلاق الفترة المحاسبية</h2>
            <p className="text-sm text-gray-500 mb-5">{closeDlg.brand.name_ar}</p>

            {!closeResult ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-5">
                  ⚠ هذا الإجراء لا يمكن التراجع عنه. سيُجمّد الشهر المختار وينشئ لقطة ثابتة من البيانات.
                </div>
                <div className="mb-5">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">اختر الشهر للإغلاق</label>
                  <select
                    value={closeMonth}
                    onChange={e => setCloseMonth(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {lastNMonths(12).map(m => (
                      <option key={m} value={m} disabled={!!(closeDlg.brand.closed_up_to && m <= closeDlg.brand.closed_up_to)}>
                        {formatYearMonth(m)}{closeDlg.brand.closed_up_to && m <= closeDlg.brand.closed_up_to ? ' (مُغلق)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={doClose}
                    disabled={closing || !closeMonth}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    {closing ? 'جارٍ الإغلاق...' : 'تأكيد الإغلاق'}
                  </button>
                  <button
                    onClick={() => setCloseDlg(null)}
                    className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg"
                  >
                    إلغاء
                  </button>
                </div>
              </>
            ) : closeResult.error ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-5">
                  {closeResult.error}
                </div>
                <button onClick={() => setCloseResult(null)} className="text-sm text-blue-600 hover:underline">← المحاولة مجدداً</button>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 space-y-2">
                  <div className="text-sm font-semibold text-green-800">✓ تم إغلاق {formatYearMonth(closeResult.year_month)}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 mt-2">
                    <div className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="text-gray-400">صافي الإيرادات</div>
                      <div className="font-mono font-bold">
                        {Number(closeResult.sales_net ?? Number(closeResult.sales) / 1.15).toFixed(2)} ر.س
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="text-gray-400">COGS</div>
                      <div className="font-mono font-bold">{Number(closeResult.cogs).toFixed(2)} ر.س</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="text-gray-400">FC%</div>
                      <div className="font-mono font-bold">{closeResult.fc_pct}%</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="text-gray-400">مخزون ختامي</div>
                      <div className="font-mono font-bold">{Number(closeResult.ending_inv_value).toFixed(2)} ر.س</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCloseDlg(null)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm py-2.5 rounded-lg"
                >
                  إغلاق
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}
