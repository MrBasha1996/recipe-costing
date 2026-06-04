'use client'

import type { Module, RolePermission, PermissionAction } from '@/types'

// ── Permission row state ───────────────────────────────────────────

export interface ModulePermState {
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

export type PermState = Record<string, ModulePermState>

/** Convert DB role_permissions array + modules array into PermState */
export function buildPermState(modules: Module[], rp: RolePermission[]): PermState {
  const rpByModule = new Map(rp.map(r => [r.module_id, r]))
  const state: PermState = {}
  for (const m of modules) {
    const r = rpByModule.get(m.id)
    state[m.code] = {
      can_view:   r?.can_view   ?? false,
      can_create: r?.can_create ?? false,
      can_update: r?.can_update ?? false,
      can_delete: r?.can_delete ?? false,
    }
  }
  return state
}

// ── Inheritance logic ──────────────────────────────────────────────

export function applyInheritance(
  prev: ModulePermState,
  action: PermissionAction,
  value: boolean,
): ModulePermState {
  let next = { ...prev, [`can_${action}`]: value }

  if (value) {
    // Enabling an action also enables its prerequisites
    if (action === 'delete') {
      next = { can_view: true, can_create: true, can_update: true, can_delete: true }
    } else if (action === 'update') {
      next.can_view = true; next.can_create = true; next.can_update = true
    } else if (action === 'create') {
      next.can_view = true; next.can_create = true
    }
  } else {
    // Disabling an action also disables its dependents
    if (action === 'view') {
      next = { can_view: false, can_create: false, can_update: false, can_delete: false }
    } else if (action === 'create') {
      next.can_update = false; next.can_delete = false
    } else if (action === 'update') {
      next.can_delete = false
    }
  }
  return next
}

// ── Component ──────────────────────────────────────────────────────

const ACTIONS: { key: PermissionAction; label: string; color: string }[] = [
  { key: 'view',   label: 'عرض',   color: 'text-blue-600' },
  { key: 'create', label: 'إضافة', color: 'text-green-600' },
  { key: 'update', label: 'تعديل', color: 'text-amber-600' },
  { key: 'delete', label: 'حذف',   color: 'text-red-600' },
]

interface Props {
  modules: Module[]
  permState: PermState
  isSuperAdmin?: boolean
  readOnly?: boolean
  onChange?: (moduleCode: string, action: PermissionAction, value: boolean) => void
}

export default function PermissionsMatrix({
  modules,
  permState,
  isSuperAdmin = false,
  readOnly = false,
  onChange,
}: Props) {
  const disabled = readOnly || isSuperAdmin

  function handleChange(moduleCode: string, action: PermissionAction, value: boolean) {
    if (disabled || !onChange) return
    onChange(moduleCode, action, value)
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold w-48">الشاشة</th>
            {ACTIONS.map(a => (
              <th key={a.key} className={`px-4 py-3 text-xs font-semibold text-center w-24 ${a.color}`}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.filter(m => m.is_active).map((mod, i) => {
            const p = permState[mod.code] ?? { can_view: false, can_create: false, can_update: false, can_delete: false }
            return (
              <tr
                key={mod.code}
                className={`border-b border-gray-100 last:border-0 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                } ${!disabled ? 'hover:bg-blue-50/30' : ''}`}
              >
                <td className="px-4 py-2.5">
                  <span className="text-gray-800 font-medium">{mod.name}</span>
                  <span className="text-xs text-gray-400 font-mono mr-2">{mod.code}</span>
                </td>
                {ACTIONS.map(a => {
                  const checked = isSuperAdmin ? true : p[`can_${a.key}` as keyof ModulePermState]
                  return (
                    <td key={a.key} className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={e => handleChange(mod.code, a.key, e.target.checked)}
                        className={`w-4 h-4 rounded border-gray-300 transition-colors ${
                          isSuperAdmin
                            ? 'accent-gray-400 cursor-not-allowed opacity-60'
                            : disabled
                            ? 'cursor-not-allowed opacity-50'
                            : `cursor-pointer accent-blue-600`
                        }`}
                        title={isSuperAdmin ? 'Super Admin لديه جميع الصلاحيات تلقائياً' : undefined}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {isSuperAdmin && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
          ⚡ Super Admin لديه جميع الصلاحيات على جميع الشاشات — لا يمكن تقييدها
        </div>
      )}
    </div>
  )
}
