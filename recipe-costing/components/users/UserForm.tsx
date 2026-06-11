'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile, BrandAccess } from '@/types'

interface RoleOption { id: string; name: string; is_super_admin: boolean }
interface BrandOption { id: string; name: string; name_ar: string }
interface BranchOption { id: string; brand_id: string; name: string }

interface Props {
  user: UserProfile | null
  onClose: () => void
  onSaved: () => void
}

export default function UserForm({ user, onClose, onSaved }: Props) {
  const isEdit = !!user

  const [nameAr, setNameAr]           = useState(user?.name_ar ?? '')
  const [username, setUsername]       = useState(user?.username ?? '')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [brandAccess, setBrandAccess] = useState<BrandAccess>(user?.brand_access ?? 'all')
  const [rbacRoleId, setRbacRoleId]   = useState<string>(user?.role_id ?? '')
  const [rbacRoles, setRbacRoles]     = useState<RoleOption[]>([])
  const [brands, setBrands]           = useState<BrandOption[]>([])
  const [branches, setBranches]       = useState<BranchOption[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // تحميل الأدوار والبراندات والفروع
  useEffect(() => {
    const supabase = createClient()

    ;(supabase.from('roles') as any)
      .select('id, name, is_super_admin')
      .order('is_super_admin', { ascending: false })
      .order('name')
      .then(({ data }: any) => setRbacRoles(data || []))

    ;(supabase.from('brands') as any)
      .select('id, name, name_ar')
      .order('id')
      .then(({ data }: any) => {
        const brandList: BrandOption[] = data || []
        setBrands(brandList)
        // تحميل الفروع لكل البراندات
        if (brandList.length > 0) {
          const ids = brandList.map((b: BrandOption) => b.id)
          ;(supabase.from('branches') as any)
            .select('id, brand_id, name')
            .in('brand_id', ids)
            .eq('is_active', true)
            .order('name')
            .then(({ data: bData }: any) => setBranches(bData || []))
        }
      })

    // تحميل صلاحيات الفروع الحالية (للتعديل فقط)
    if (isEdit && user?.id) {
      ;(supabase.from('user_branch_access') as any)
        .select('branch_id')
        .eq('user_id', user.id)
        .then(({ data }: any) => {
          setSelectedBranchIds(new Set((data || []).map((r: any) => r.branch_id)))
        })
    }
  }, [isEdit, user?.id])

  // الفروع المرئية بحسب اختيار البراند
  const visibleBranches = brandAccess === 'all'
    ? branches
    : branches.filter(b => b.brand_id === brandAccess)

  function toggleBranch(branchId: string) {
    setSelectedBranchIds(prev => {
      const next = new Set(prev)
      if (next.has(branchId)) next.delete(branchId)
      else next.add(branchId)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameAr.trim()) { setError('الاسم مطلوب'); return }
    if (!rbacRoleId) { setError('يجب اختيار مجموعة الصلاحيات'); return }
    if (!isEdit && (!email.trim() || !password.trim() || !username.trim())) {
      setError('جميع الحقول مطلوبة'); return
    }

    setSaving(true)
    setError(null)

    try {
      let userId: string

      if (isEdit) {
        const res = await fetch(`/api/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name_ar: nameAr,
            brand_access: brandAccess,
            role_id: rbacRoleId || null,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        userId = user!.id
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email, password, username,
            name_ar: nameAr,
            brand_access: brandAccess,
            role_id: rbacRoleId || null,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const data = await res.json()
        userId = data.id
      }

      // حفظ صلاحيات الفروع
      if (userId && branches.length > 0) {
        const supabase = createClient()
        // احذف الصلاحيات القديمة
        await (supabase.from('user_branch_access') as any)
          .delete()
          .eq('user_id', userId)

        // أضف الصلاحيات الجديدة (فقط إن كانت هناك تقييدات)
        if (selectedBranchIds.size > 0 && selectedBranchIds.size < visibleBranches.length) {
          const rows = [...selectedBranchIds].map(branch_id => ({ user_id: userId, branch_id }))
          await (supabase.from('user_branch_access') as any).insert(rows)
        }
      }

      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // براند labels ديناميكية
  const BRAND_OPTIONS = [
    { value: 'all', label: `كل العلامات (${brands.map(b => b.name_ar).join(' + ')})` },
    ...brands.map(b => ({ value: b.id, label: `${b.name_ar} فقط` })),
  ]

  const allVisibleSelected = visibleBranches.length > 0 &&
    visibleBranches.every(b => selectedBranchIds.has(b.id))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <Field label="الاسم بالعربي">
            <input
              type="text"
              value={nameAr}
              onChange={e => setNameAr(e.target.value)}
              placeholder="محمد العلي"
              className={inputCls}
              required
            />
          </Field>

          {/* Create-only fields */}
          {!isEdit && (
            <>
              <Field label="اسم المستخدم (username)">
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="mohammed.ali"
                  className={inputCls}
                  required
                  dir="ltr"
                />
              </Field>
              <Field label="البريد الإلكتروني">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className={inputCls}
                  required
                  dir="ltr"
                />
              </Field>
              <Field label="كلمة المرور">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  className={inputCls}
                  required
                  minLength={8}
                  dir="ltr"
                />
              </Field>
            </>
          )}

          {/* RBAC Role */}
          <Field label="المجموعة (الصلاحيات) *">
            {rbacRoles.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ لا توجد مجموعات — أنشئ مجموعات أولاً من صفحة &quot;المجموعات&quot;
              </div>
            ) : (
              <select
                value={rbacRoleId}
                onChange={e => setRbacRoleId(e.target.value)}
                className={inputCls}
                required
              >
                <option value="">اختر مجموعة...</option>
                {rbacRoles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.is_super_admin ? ' ⚡ (صلاحيات كاملة)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* Brand access — ديناميكي */}
          <Field label="الوصول للعلامات التجارية">
            <div className="space-y-2">
              {BRAND_OPTIONS.map(b => (
                <label key={b.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="brand"
                    value={b.value}
                    checked={brandAccess === b.value}
                    onChange={() => {
                      setBrandAccess(b.value)
                      setSelectedBranchIds(new Set())
                    }}
                    className="accent-blue-500"
                  />
                  <span className={`text-sm ${brandAccess === b.value ? 'text-gray-900 font-medium' : 'text-gray-500'} group-hover:text-gray-900 transition-colors`}>
                    {b.label}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {/* Branch access */}
          {visibleBranches.length > 0 && (
            <Field label="تقييد الفروع (اختياري)">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">لا تحديد = الوصول لكل الفروع</span>
                  <button
                    type="button"
                    onClick={() => setSelectedBranchIds(
                      allVisibleSelected ? new Set() : new Set(visibleBranches.map(b => b.id))
                    )}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {allVisibleSelected ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {visibleBranches.map(b => (
                    <label key={b.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedBranchIds.has(b.id)}
                        onChange={() => toggleBranch(b.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">{b.name}</span>
                      {brandAccess === 'all' && (
                        <span className="text-xs text-gray-400 mr-auto">{b.brand_id}</span>
                      )}
                    </label>
                  ))}
                </div>
                {selectedBranchIds.size > 0 && selectedBranchIds.size < visibleBranches.length && (
                  <div className="px-3 py-1.5 bg-blue-50 text-xs text-blue-700">
                    مقيّد بـ {selectedBranchIds.size} من {visibleBranches.length} فرع
                  </div>
                )}
              </div>
            </Field>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {saving ? 'جارٍ الحفظ...' : isEdit ? 'تحديث' : 'إنشاء المستخدم'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors'
