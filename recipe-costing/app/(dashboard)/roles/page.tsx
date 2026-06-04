'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { usePermissions } from '@/hooks/usePermissions'
import PermissionsMatrix, {
  buildPermState,
  applyInheritance,
  type PermState,
} from '@/components/rbac/PermissionsMatrix'
import RoleFormModal from '@/components/rbac/RoleFormModal'
import CopyPermissionsModal from '@/components/rbac/CopyPermissionsModal'
import type { RbacRole, Module, RolePermission, PermissionAction, RbacAuditLog } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: { ok: boolean; text: string } | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [msg, onClose])
  if (!msg) return null
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${msg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
      {msg.text}
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
        <p className="text-sm text-gray-800">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
          <button onClick={onConfirm} className="px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">حذف</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function RolesPage() {
  const { hydrated } = useBrandStore()
  const { hasPermission, isSuperAdmin } = usePermissions()

  const [roles, setRoles] = useState<RbacRole[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [userCounts, setUserCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Selected role for permissions panel
  const [selectedRole, setSelectedRole] = useState<RbacRole | null>(null)
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([])
  const [permState, setPermState] = useState<PermState>({})
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)
  const [permsDirty, setPermsDirty] = useState(false)

  // Modals
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null)
  const [copySourceRole, setCopySourceRole] = useState<RbacRole | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RbacRole | null>(null)

  // Audit log tab
  const [tab, setTab] = useState<'roles' | 'audit'>('roles')
  const [auditLogs, setAuditLogs] = useState<RbacAuditLog[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Search
  const [search, setSearch] = useState('')

  // Toast
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  const supabase = createClient()

  // ── Load ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!hydrated) return
    setLoading(true)
    const [{ data: rolesData }, { data: modulesData }] = await Promise.all([
      (supabase.from('roles') as any).select('*').order('created_at'),
      (supabase.from('modules') as any).select('*').order('sort_order'),
    ])

    const rs = (rolesData as RbacRole[]) || []
    const ms = (modulesData as Module[]) || []
    setRoles(rs)
    setModules(ms)

    // Count users per role
    const { data: profilesData } = await (supabase.from('user_profiles') as any)
      .select('role_id')
      .not('role_id', 'is', null)
    const counts: Record<string, number> = {}
    for (const p of (profilesData || []) as any[]) {
      if (p.role_id) counts[p.role_id] = (counts[p.role_id] ?? 0) + 1
    }
    setUserCounts(counts)
    setLoading(false)
  }, [hydrated])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Load permissions for selected role ────────────────────────
  const loadPermissions = useCallback(async (role: RbacRole) => {
    setLoadingPerms(true)
    setPermsDirty(false)
    const { data } = await (supabase.from('role_permissions') as any)
      .select('*')
      .eq('role_id', role.id)
    const rp = (data as RolePermission[]) || []
    setRolePerms(rp)
    setPermState(buildPermState(modules, rp))
    setLoadingPerms(false)
  }, [modules])

  function handleSelectRole(role: RbacRole) {
    setSelectedRole(role)
    loadPermissions(role)
  }

  // ── Permissions change with inheritance ───────────────────────
  function handlePermChange(moduleCode: string, action: PermissionAction, value: boolean) {
    setPermState(prev => {
      const current = prev[moduleCode] ?? { can_view: false, can_create: false, can_update: false, can_delete: false }
      return { ...prev, [moduleCode]: applyInheritance(current, action, value) }
    })
    setPermsDirty(true)
  }

  // ── Save permissions ──────────────────────────────────────────
  async function handleSavePerms() {
    if (!selectedRole) return
    setSavingPerms(true)
    try {
      const moduleMap = new Map(modules.map(m => [m.code, m.id]))
      const upsertRows = Object.entries(permState).map(([code, p]) => ({
        role_id:    selectedRole.id,
        module_id:  moduleMap.get(code),
        can_view:   p.can_view,
        can_create: p.can_create,
        can_update: p.can_update,
        can_delete: p.can_delete,
      })).filter(r => r.module_id)

      const { error } = await (supabase.from('role_permissions') as any)
        .upsert(upsertRows, { onConflict: 'role_id,module_id' })
      if (error) throw error

      // Audit log
      await (supabase.from('rbac_audit_logs') as any).insert({
        action: 'update_permissions',
        entity_type: 'role',
        entity_id: selectedRole.id,
        entity_name: selectedRole.name,
        new_data: permState,
      })

      setPermsDirty(false)
      setToast({ ok: true, text: `تم حفظ صلاحيات "${selectedRole.name}" ✓` })
    } catch (e: any) {
      setToast({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setSavingPerms(false)
    }
  }

  // ── Delete role ───────────────────────────────────────────────
  async function handleDeleteRole() {
    if (!deleteTarget) return
    try {
      const { error } = await (supabase.from('roles') as any)
        .delete()
        .eq('id', deleteTarget.id)
      if (error) throw error

      await (supabase.from('rbac_audit_logs') as any).insert({
        action: 'delete_role',
        entity_type: 'role',
        entity_id: deleteTarget.id,
        entity_name: deleteTarget.name,
      })

      if (selectedRole?.id === deleteTarget.id) { setSelectedRole(null); setPermState({}) }
      setToast({ ok: true, text: `تم حذف "${deleteTarget.name}" ✓` })
      loadAll()
    } catch (e: any) {
      setToast({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── Audit log ─────────────────────────────────────────────────
  async function loadAudit() {
    setLoadingAudit(true)
    const { data } = await (supabase.from('rbac_audit_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setAuditLogs((data as RbacAuditLog[]) || [])
    setLoadingAudit(false)
  }

  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab])

  const filteredRoles = roles.filter(r =>
    !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())
  )

  const canEdit   = isSuperAdmin || hasPermission('roles', 'update')
  const canCreate = isSuperAdmin || hasPermission('roles', 'create')
  const canDelete = isSuperAdmin || hasPermission('roles', 'delete')

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5" dir="rtl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">إدارة المجموعات والصلاحيات</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {roles.length} مجموعة · {modules.length} شاشة
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {[['roles', 'المجموعات'], ['audit', 'سجل التدقيق']] .map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v as any)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── ROLES TAB ─────────────────────────────────────── */}
      {tab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Left: Roles list */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="بحث عن مجموعة..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />
              {canCreate && (
                <button
                  onClick={() => { setEditingRole(null); setShowRoleForm(true) }}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  + إضافة
                </button>
              )}
            </div>

            {!hydrated || loading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
            ) : filteredRoles.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">لا توجد مجموعات</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">المجموعة</th>
                      <th className="text-center px-3 py-3 text-xs text-gray-500 font-semibold w-20">المستخدمون</th>
                      <th className="text-center px-3 py-3 text-xs text-gray-500 font-semibold w-28">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoles.map(role => {
                      const isSelected = selectedRole?.id === role.id
                      return (
                        <tr
                          key={role.id}
                          onClick={() => handleSelectRole(role)}
                          className={`border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50 border-r-2 border-r-blue-500' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{role.name}</span>
                              {role.is_super_admin && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                                  Super Admin
                                </span>
                              )}
                              {role.is_system && (
                                <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                                  نظام
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <div className="text-xs text-gray-400 mt-0.5">{role.description}</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-sm font-medium text-gray-700">
                              {userCounts[role.id] ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setCopySourceRole(role)}
                                title="نسخ الصلاحيات"
                                className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                              >
                                نسخ
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => { setEditingRole(role); setShowRoleForm(true) }}
                                  title="تعديل"
                                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                >
                                  ✏
                                </button>
                              )}
                              {canDelete && !role.is_system && (
                                <button
                                  onClick={() => setDeleteTarget(role)}
                                  title="حذف"
                                  className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  ✗
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: Permissions panel */}
          <div className="space-y-3">
            {!selectedRole ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                <div className="text-3xl mb-2">🔐</div>
                <div>اختر مجموعة من القائمة لعرض صلاحياتها</div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedRole.name}</h2>
                    <p className="text-xs text-gray-500">صلاحيات الشاشات</p>
                  </div>
                  {canEdit && !selectedRole.is_super_admin && (
                    <button
                      onClick={handleSavePerms}
                      disabled={!permsDirty || savingPerms}
                      className="px-4 py-1.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                    >
                      {savingPerms ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                    </button>
                  )}
                </div>

                {loadingPerms ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                    جارٍ التحميل...
                  </div>
                ) : (
                  <PermissionsMatrix
                    modules={modules}
                    permState={permState}
                    isSuperAdmin={selectedRole.is_super_admin}
                    readOnly={!canEdit || selectedRole.is_super_admin}
                    onChange={handlePermChange}
                  />
                )}

                {permsDirty && (
                  <p className="text-xs text-amber-600">⚠ يوجد تعديلات غير محفوظة</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── AUDIT TAB ─────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          {loadingAudit ? (
            <div className="text-center text-gray-400 py-12 text-sm">جارٍ التحميل...</div>
          ) : auditLogs.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              لا توجد سجلات بعد
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">التاريخ</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">العملية</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold">الكيان</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('ar-SA', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {log.entity_name ?? log.entity_id ?? '—'}
                        <span className="text-xs text-gray-400 mr-1">({log.entity_type})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────── */}
      {showRoleForm && (
        <RoleFormModal
          role={editingRole}
          supabase={supabase}
          onClose={() => setShowRoleForm(false)}
          onSaved={async (saved) => {
            setShowRoleForm(false)
            await (supabase.from('rbac_audit_logs') as any).insert({
              action: editingRole ? 'update_role' : 'create_role',
              entity_type: 'role',
              entity_id: saved.id,
              entity_name: saved.name,
              new_data: { name: saved.name, description: saved.description },
            })
            setToast({ ok: true, text: editingRole ? `تم تعديل "${saved.name}" ✓` : `تم إنشاء "${saved.name}" ✓` })
            loadAll()
          }}
        />
      )}

      {copySourceRole && (
        <CopyPermissionsModal
          sourceRole={copySourceRole}
          allRoles={roles}
          supabase={supabase}
          onClose={() => setCopySourceRole(null)}
          onCopied={() => {
            setToast({ ok: true, text: `تم نسخ صلاحيات "${copySourceRole.name}" ✓` })
            if (selectedRole) loadPermissions(selectedRole)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`هل تريد حذف مجموعة "${deleteTarget.name}"؟ سيؤدي ذلك إلى إزالة جميع صلاحياتها وإلغاء ارتباطها بالمستخدمين.`}
          onConfirm={handleDeleteRole}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}
