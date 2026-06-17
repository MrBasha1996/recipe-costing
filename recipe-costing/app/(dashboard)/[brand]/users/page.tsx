'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import UserForm from '@/components/users/UserForm'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { UserProfile, AuditLog } from '@/types'

const BRAND_LABELS: Record<string, string> = {
  all: 'الكل',
  ti: 'Three In',
  bb: 'باب البلد',
}

const ACTION_LABELS: Record<string, string> = {
  recipe_saved: 'حفظ وصفة',
  bulk_price_update: 'تحديث أسعار جماعي',
  ingredient_updated: 'تحديث مادة خام',
  product_created: 'إنشاء منتج',
  product_updated: 'تحديث منتج',
  product_deleted: 'حذف منتج',
}

type Tab = 'users' | 'audit'

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [auditLogs, setAuditLogs] = useState<(AuditLog & { performer?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<UserProfile | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('user_profiles') as any)
      .select('*, roles(name)')
      .order('created_at', { ascending: false })
    setUsers((data as UserProfile[]) || [])
    setLoading(false)
  }, [])

  const loadAudit = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('audit_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    // Resolve performer names
    const logs = (data as AuditLog[]) || []
    const profileIds = [...new Set(logs.map(l => l.performed_by).filter(Boolean))]

    const profileMap: Record<string, string> = {}
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, name_ar')
        .in('id', profileIds as string[])
      ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p.name_ar })
    }

    setAuditLogs(logs.map(l => ({
      ...l,
      performer: l.performed_by ? profileMap[l.performed_by] ?? 'مجهول' : 'النظام',
    })))
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab, loadAudit])

  function handleDelete(user: UserProfile) {
    setDlg({ msg: `حذف "${user.name_ar}"؟ هذا الإجراء لا يمكن التراجع عنه.`, onOk: async () => {
      setDeletingId(user.id)
      try {
        const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json()
          setDlg({ msg: data.error ?? 'فشل الحذف', onOk: () => {} })
          return
        }
        await loadUsers()
      } finally {
        setDeletingId(null)
      }
    }})
  }

  function handleEdit(user: UserProfile) {
    setEditUser(user)
    setShowForm(true)
  }

  function handleAddNew() {
    setEditUser(null)
    setShowForm(true)
  }

  function handleFormClose() {
    setShowForm(false)
    setEditUser(null)
  }

  async function handleSaved() {
    handleFormClose()
    await loadUsers()
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-gray-500 text-sm mt-0.5">{users.length} مستخدم مسجّل</p>
        </div>
        <button
          onClick={handleAddNew}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + إضافة مستخدم
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['users', 'المستخدمون'], ['audit', 'سجل التدقيق']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Users tab ────────────────────────────────────────────── */}
      {tab === 'users' && (
        loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">جارٍ التحميل...</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium">المستخدم</th>
                  <th className="text-center px-4 py-3 font-medium">الدور</th>
                  <th className="text-center px-4 py-3 font-medium">الوصول</th>
                  <th className="text-center px-4 py-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-center px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.name_ar}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{u.username}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
                        {(u as any).roles?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-600">{BRAND_LABELS[u.brand_access] ?? u.brand_access}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {new Date(u.created_at).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(u)}
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                          className="text-xs px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingId === u.id ? '...' : 'حذف'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      لا يوجد مستخدمون
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Audit tab ─────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="text-sm font-medium text-gray-900">آخر {auditLogs.length} عملية</span>
            <button
              onClick={loadAudit}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              تحديث
            </button>
          </div>
          <div className="overflow-x-auto">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                  <th className="text-right px-4 py-2.5 font-medium">العملية</th>
                  <th className="text-right px-4 py-2.5 font-medium">العنصر</th>
                  <th className="text-center px-4 py-2.5 font-medium">العلامة</th>
                  <th className="text-right px-4 py-2.5 font-medium">المستخدم</th>
                  <th className="text-left px-4 py-2.5 font-medium">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-gray-700">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-gray-600 truncate max-w-[200px]">
                        {log.entity_name ?? '—'}
                      </div>
                      {log.entity_sku && (
                        <div className="text-xs text-gray-400 font-mono">{log.entity_sku}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {log.brand_id && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          log.brand_id === 'ti'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {log.brand_id === 'ti' ? 'Three In' : 'باب البلد'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {(log as any).performer}
                    </td>
                    <td className="px-4 py-2.5 text-left text-xs text-gray-400 font-mono">
                      {new Date(log.created_at).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      لا توجد عمليات مسجّلة بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <UserForm
          user={editUser}
          onClose={handleFormClose}
          onSaved={handleSaved}
        />
      )}
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}
