'use client'

import { useState } from 'react'
import type { RbacRbacRole } from '@/types'

interface Props {
  sourceRbacRole: RbacRole             // The role whose permissions we want to copy FROM
  allRbacRoles: RbacRole[]
  onClose: () => void
  onCopied: () => void
  supabase: any
}

export default function CopyPermissionsModal({
  sourceRbacRole,
  allRbacRoles,
  onClose,
  onCopied,
  supabase,
}: Props) {
  const [targetRbacRoleId, setTargetRbacRoleId] = useState('')
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')

  const targetOptions = allRbacRoles.filter(r => r.id !== sourceRbacRole.id && !r.is_super_admin)

  async function handleCopy() {
    if (!targetRbacRoleId) { setError('اختر المجموعة المستهدفة'); return }
    setCopying(true); setError('')
    try {
      // Fetch source permissions
      const { data: sourcePerm, error: fetchErr } = await supabase
        .from('role_permissions')
        .select('module_id, can_view, can_create, can_update, can_delete')
        .eq('role_id', sourceRbacRole.id)
      if (fetchErr) throw fetchErr

      if (!sourcePerm || sourcePerm.length === 0) {
        throw new Error('لا توجد صلاحيات في المجموعة المصدر لنسخها')
      }

      // Delete existing permissions for target role
      await supabase.from('role_permissions').delete().eq('role_id', targetRbacRoleId)

      // Insert copied permissions
      const rows = (sourcePerm as any[]).map((p: any) => ({
        role_id:    targetRbacRoleId,
        module_id:  p.module_id,
        can_view:   p.can_view,
        can_create: p.can_create,
        can_update: p.can_update,
        can_delete: p.can_delete,
      }))
      const { error: insertErr } = await supabase.from('role_permissions').insert(rows)
      if (insertErr) throw insertErr

      onCopied()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">نسخ الصلاحيات</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-600">
          نسخ صلاحيات <strong>{sourceRbacRole.name}</strong> إلى:
        </p>

        <select
          value={targetRbacRoleId}
          onChange={e => setTargetRbacRoleId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
        >
          <option value="">اختر المجموعة المستهدفة...</option>
          {targetOptions.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        {targetOptions.length === 0 && (
          <p className="text-xs text-gray-400 text-center">لا توجد مجموعات أخرى متاحة</p>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          ⚠ سيتم استبدال صلاحيات المجموعة المستهدفة بالكامل
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            إلغاء
          </button>
          <button
            onClick={handleCopy}
            disabled={copying || !targetRbacRoleId}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {copying ? 'جارٍ النسخ...' : 'نسخ الصلاحيات'}
          </button>
        </div>
      </div>
    </div>
  )
}
