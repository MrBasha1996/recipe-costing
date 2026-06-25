'use client'

import React from 'react'
import type { Module, RolePermission, PermissionAction } from '@/types'

// ── Permission row state ───────────────────────────────────────────

export interface ModulePermState {
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_approve: boolean
  can_post: boolean
  can_print: boolean
  can_export: boolean
  can_import: boolean
  // extra — shown only for modules that support price editing
  can_edit_price: boolean
}

export type PermState = Record<string, ModulePermState>

const EMPTY_PERM: ModulePermState = {
  can_view: false, can_create: false, can_update: false, can_delete: false,
  can_approve: false, can_post: false, can_print: false, can_export: false,
  can_import: false, can_edit_price: false,
}

/** Convert DB role_permissions array + modules array into PermState */
export function buildPermState(modules: Module[], rp: RolePermission[]): PermState {
  const rpByModule = new Map(rp.map(r => [r.module_id, r]))
  const state: PermState = {}
  for (const m of modules) {
    const r = rpByModule.get(m.id)
    state[m.code] = {
      can_view:       r?.can_view       ?? false,
      can_create:     r?.can_create     ?? false,
      can_update:     r?.can_update     ?? false,
      can_delete:     r?.can_delete     ?? false,
      can_approve:    r?.can_approve    ?? false,
      can_post:       r?.can_post       ?? false,
      can_print:      r?.can_print      ?? false,
      can_export:     r?.can_export     ?? false,
      can_import:     r?.can_import     ?? false,
      can_edit_price: r?.can_edit_price ?? false,
    }
  }
  return state
}

// ── Inheritance / dependency logic ─────────────────────────────────
//
// Rules:
//   Checking any action        → auto-check view
//   Checking delete            → auto-check view + create + update
//   Checking update            → auto-check view + create
//   Checking create            → auto-check view
//   Unchecking view            → uncheck ALL
//   Unchecking create          → uncheck update + delete
//   Unchecking update          → uncheck delete

export function applyInheritance(
  prev: ModulePermState,
  action: PermissionAction,
  value: boolean,
): ModulePermState {
  const next = { ...prev, [`can_${action}`]: value }

  if (value) {
    // Every action requires view
    next.can_view = true
    if (action === 'delete') {
      next.can_create = true
      next.can_update = true
    } else if (action === 'update') {
      next.can_create = true
    }
  } else {
    if (action === 'view') {
      // Removing view removes everything
      return { ...EMPTY_PERM }
    } else if (action === 'create') {
      next.can_update = false
      next.can_delete = false
    } else if (action === 'update') {
      next.can_delete = false
    }
  }
  return next
}

// ── Column definitions ─────────────────────────────────────────────

// 9 standard columns shown for every module
const STANDARD_ACTIONS: { key: PermissionAction; label: string; color: string }[] = [
  { key: 'view',    label: 'عرض',     color: 'text-blue-600' },
  { key: 'create',  label: 'إضافة',   color: 'text-green-600' },
  { key: 'update',  label: 'تعديل',   color: 'text-amber-600' },
  { key: 'delete',  label: 'حذف',     color: 'text-red-600' },
  { key: 'approve', label: 'اعتماد',  color: 'text-purple-600' },
  { key: 'post',    label: 'ترحيل',   color: 'text-cyan-600' },
  { key: 'print',   label: 'طباعة',   color: 'text-slate-600' },
  { key: 'export',  label: 'تصدير',   color: 'text-teal-600' },
  { key: 'import',  label: 'استيراد', color: 'text-indigo-600' },
]

// Extra column — only for modules that have price management
const PRICE_MODULES = new Set(['costing', 'products', 'ingredients'])

// ── Component ──────────────────────────────────────────────────────

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
      <table suppressHydrationWarning className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold sticky right-0 bg-gray-50 z-10 min-w-[140px]">
              الشاشة
            </th>
            {STANDARD_ACTIONS.map(a => (
              <th key={a.key} className={`px-2 py-3 text-xs font-semibold text-center min-w-[60px] ${a.color}`}>
                {a.label}
              </th>
            ))}
            <th className="px-2 py-3 text-xs font-semibold text-center min-w-[70px] text-orange-600">
              تعديل سعر
            </th>
          </tr>
        </thead>
        <tbody>
          {modules.filter(m => m.is_active).map((mod, i) => {
            const p = permState[mod.code] ?? EMPTY_PERM
            const hasPriceCol = PRICE_MODULES.has(mod.code)
            const isFirstReportModule = mod.code === 'report_pl' ||
              (mod.code.startsWith('report_') &&
                !modules.filter(m => m.is_active).slice(0, i).some(m => m.code.startsWith('report_')))
            return (
              <React.Fragment key={mod.code}>
                {isFirstReportModule && (
                  <tr className="bg-blue-50/60 border-b border-blue-100">
                    <td colSpan={STANDARD_ACTIONS.length + 2} className="px-4 py-2 text-xs font-semibold text-blue-700 tracking-wide">
                      📊 تقارير التبويبات — كل صلاحية تتحكم في ظهور تبويب واحد
                    </td>
                  </tr>
                )}
              <tr
                className={`border-b border-gray-100 last:border-0 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                } ${!disabled ? 'hover:bg-blue-50/30' : ''}`}
              >
                <td className="px-4 py-2.5 sticky right-0 bg-inherit z-10">
                  {mod.code.startsWith('report_') ? (
                    <span className="text-gray-600 text-sm pr-3">↳ {mod.name}</span>
                  ) : (
                    <span className="text-gray-800 font-medium">{mod.name}</span>
                  )}
                </td>

                {STANDARD_ACTIONS.map(a => {
                  const checked = isSuperAdmin ? true : p[`can_${a.key}` as keyof ModulePermState] as boolean
                  return (
                    <td key={a.key} className="px-2 py-2.5 text-center">
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
                            : 'cursor-pointer accent-blue-600'
                        }`}
                        title={isSuperAdmin ? 'Super Admin لديه جميع الصلاحيات تلقائياً' : undefined}
                      />
                    </td>
                  )
                })}

                {/* تعديل سعر — only for price-managed modules */}
                <td className="px-2 py-2.5 text-center">
                  {hasPriceCol ? (
                    <input
                      type="checkbox"
                      checked={isSuperAdmin ? true : p.can_edit_price}
                      disabled={disabled}
                      onChange={e => handleChange(mod.code, 'edit_price', e.target.checked)}
                      className={`w-4 h-4 rounded border-gray-300 transition-colors ${
                        isSuperAdmin
                          ? 'accent-gray-400 cursor-not-allowed opacity-60'
                          : disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer accent-orange-500'
                      }`}
                      title={isSuperAdmin ? 'Super Admin لديه جميع الصلاحيات تلقائياً' : undefined}
                    />
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
              </React.Fragment>
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
