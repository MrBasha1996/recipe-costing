'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissionsStore } from '@/stores/permissionsStore'
import type { Brand } from '@/types'

interface BrandRow extends Brand {
  user_count?: number
}

interface FormState {
  id: string
  name: string
  name_ar: string
  fc_target_low: string
  fc_target_high: string
}

const EMPTY_FORM: FormState = { id: '', name: '', name_ar: '', fc_target_low: '35', fc_target_high: '45' }

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBrand, setEditBrand] = useState<BrandRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { hasPermission, isSuperAdmin } = usePermissionsStore()
  const canCreate = isSuperAdmin || hasPermission('brands', 'create')
  const canUpdate = isSuperAdmin || hasPermission('brands', 'update')
  const canDelete = isSuperAdmin || hasPermission('brands', 'delete')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: brandData } = await (supabase.from('brands') as any)
      .select('id, name, name_ar, fc_target_low, fc_target_high')
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
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    setError('')
    const fcLow  = parseFloat(form.fc_target_low)
    const fcHigh = parseFloat(form.fc_target_high)
    if (!form.id.trim() || !form.name.trim() || !form.name_ar.trim()) {
      setError('جميع الحقول مطلوبة')
      return
    }
    if (isNaN(fcLow) || isNaN(fcHigh) || fcLow >= fcHigh) {
      setError('أهداف FC% غير صحيحة')
      return
    }

    setSaving(true)
    const supabase = createClient()
    try {
      if (editBrand) {
        const { error: err } = await (supabase.from('brands') as any)
          .update({ name: form.name.trim(), name_ar: form.name_ar.trim(), fc_target_low: fcLow, fc_target_high: fcHigh })
          .eq('id', editBrand.id)
        if (err) throw err
      } else {
        const { error: err } = await (supabase.from('brands') as any)
          .insert({ id: form.id.trim().toLowerCase(), name: form.name.trim(), name_ar: form.name_ar.trim(), fc_target_low: fcLow, fc_target_high: fcHigh })
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

  async function handleDelete(b: BrandRow) {
    if (!confirm(`حذف براند "${b.name_ar}"؟ لا يمكن الحذف إن كانت هناك بيانات مرتبطة.`)) return
    setDeletingId(b.id)
    const supabase = createClient()
    const { error: err } = await (supabase.from('brands') as any).delete().eq('id', b.id)
    if (err) {
      alert('فشل الحذف: ' + (err.message ?? 'هناك بيانات مرتبطة بهذا البراند'))
    } else {
      await load()
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-5 max-w-4xl">
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
                <th className="text-center px-4 py-3 font-medium">هدف FC%</th>
                <th className="text-center px-4 py-3 font-medium">المستخدمون</th>
                <th className="text-center px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {brands.map(b => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{b.name_ar}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{b.name}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{b.id}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">
                    {b.fc_target_low ?? 35}% – {b.fc_target_high ?? 45}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-medium text-gray-700">{b.user_count ?? 0}</span>
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
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">لا توجد براندات</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الاسم العربي</label>
                <input
                  value={form.name_ar}
                  onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                  placeholder="باب البلد"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  dir="rtl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الاسم الإنجليزي</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Bab Al Balad"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">هدف FC% الأدنى</label>
                  <input
                    type="number"
                    value={form.fc_target_low}
                    onChange={e => setForm(f => ({ ...f, fc_target_low: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">هدف FC% الأعلى</label>
                  <input
                    type="number"
                    value={form.fc_target_high}
                    onChange={e => setForm(f => ({ ...f, fc_target_high: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
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
    </div>
  )
}
