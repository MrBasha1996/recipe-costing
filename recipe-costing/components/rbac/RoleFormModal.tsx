'use client'

import { useState, useEffect } from 'react'
import type { RbacRole } from '@/types'

interface Props {
  role: RbacRole | null          // null = create mode
  onClose: () => void
  onSaved: (role: RbacRole) => void
  supabase: any
}

export default function RbacRoleFormModal({ role, onClose, onSaved, supabase }: Props) {
  const isEdit = !!role
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setError('')
  }, [role])

  async function handleSave() {
    if (!name.trim()) { setError('اسم المجموعة مطلوب'); return }
    setSaving(true); setError('')
    try {
      if (isEdit) {
        const { data, error: err } = await supabase
          .from('roles')
          .update({ name: name.trim(), description: description.trim() || null })
          .eq('id', role!.id)
          .select()
          .single()
        if (err) throw err
        onSaved(data as RbacRole)
      } else {
        const { data, error: err } = await supabase
          .from('roles')
          .insert({ name: name.trim(), description: description.trim() || null })
          .select()
          .single()
        if (err) throw err
        onSaved(data as RbacRole)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'تعديل المجموعة' : 'إضافة مجموعة جديدة'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {role?.is_system && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            ⚠ هذه مجموعة النظام — لا يمكن تغيير نوعها أو حذفها
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              اسم المجموعة <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={role?.is_system && isEdit}
              placeholder="مثال: محاسب، مشرف..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الوصف (اختياري)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="وصف مختصر لصلاحيات هذه المجموعة..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة المجموعة'}
          </button>
        </div>
      </div>
    </div>
  )
}
