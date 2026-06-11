'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissionsStore } from '@/stores/permissionsStore'
import type { BrandId } from '@/types'

interface Branch {
  id: string
  brand_id: string
  name: string
  ref: string | null
  is_active: boolean
  created_at: string
}

interface FormState { name: string; ref: string; is_active: boolean }
const EMPTY_FORM: FormState = { name: '', ref: '', is_active: true }

export default function BranchesPage() {
  const { brand } = useParams() as { brand: BrandId }
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { hasPermission, isSuperAdmin } = usePermissionsStore()
  const canCreate = isSuperAdmin || hasPermission('branches', 'create')
  const canUpdate = isSuperAdmin || hasPermission('branches', 'update')
  const canDelete = isSuperAdmin || hasPermission('branches', 'delete')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('branches') as any)
      .select('*')
      .eq('brand_id', brand)
      .order('name')
    setBranches(data ?? [])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditBranch(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(b: Branch) {
    setEditBranch(b)
    setForm({ name: b.name, ref: b.ref ?? '', is_active: b.is_active })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    setError('')
    if (!form.name.trim()) { setError('اسم الفرع مطلوب'); return }
    setSaving(true)
    const supabase = createClient()
    try {
      if (editBranch) {
        const { error: err } = await (supabase.from('branches') as any)
          .update({ name: form.name.trim(), ref: form.ref.trim() || null, is_active: form.is_active })
          .eq('id', editBranch.id)
        if (err) throw err
      } else {
        const { error: err } = await (supabase.from('branches') as any)
          .insert({ brand_id: brand, name: form.name.trim(), ref: form.ref.trim() || null, is_active: form.is_active })
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

  async function handleDelete(b: Branch) {
    if (!confirm(`حذف فرع "${b.name}"؟`)) return
    setDeletingId(b.id)
    const supabase = createClient()
    const { error: err } = await (supabase.from('branches') as any).delete().eq('id', b.id)
    if (err) alert('فشل الحذف: ' + err.message)
    else await load()
    setDeletingId(null)
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">إدارة الفروع</h1>
          <p className="text-gray-500 text-sm mt-0.5">{branches.length} فرع مسجّل</p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + إضافة فرع
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">جارٍ التحميل...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                <th className="text-right px-4 py-3 font-medium">اسم الفرع</th>
                <th className="text-center px-4 py-3 font-medium">الرمز (Ref)</th>
                <th className="text-center px-4 py-3 font-medium">الحالة</th>
                <th className="text-center px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-center">
                    {b.ref ? (
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{b.ref}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      b.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {b.is_active ? 'نشط' : 'معطّل'}
                    </span>
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
              {branches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                    لا توجد فروع — أضف فرعاً أو شغّل migration 022 لمزامنة الفروع التاريخية
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editBranch ? `تعديل — ${editBranch.name}` : 'إضافة فرع جديد'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">اسم الفرع</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="الفرع الرئيسي"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">رمز Foodics (اختياري)</label>
                <input
                  value={form.ref}
                  onChange={e => setForm(f => ({ ...f, ref: e.target.value }))}
                  placeholder="B01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                  dir="ltr"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-gray-700">فرع نشط</span>
              </label>
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
                className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg"
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
