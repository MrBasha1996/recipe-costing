'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile, BrandAccess } from '@/types'

interface RoleOption { id: string; name: string; is_super_admin: boolean }

interface Props {
  user: UserProfile | null
  onClose: () => void
  onSaved: () => void
}

const BRANDS: { value: BrandAccess; label: string }[] = [
  { value: 'all', label: 'كل العلامات (TI + BB)' },
  { value: 'ti',  label: 'Three In فقط' },
  { value: 'bb',  label: 'باب البلد فقط' },
]

export default function UserForm({ user, onClose, onSaved }: Props) {
  const isEdit = !!user

  const [nameAr, setNameAr]           = useState(user?.name_ar ?? '')
  const [username, setUsername]       = useState(user?.username ?? '')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [brandAccess, setBrandAccess] = useState<BrandAccess>(user?.brand_access ?? 'ti')
  const [rbacRoleId, setRbacRoleId]   = useState<string>(user?.role_id ?? '')
  const [rbacRoles, setRbacRoles]     = useState<RoleOption[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(supabase.from('roles') as any)
      .select('id, name, is_super_admin')
      .order('is_super_admin', { ascending: false })
      .order('name')
      .then(({ data }: any) => setRbacRoles(data || []))
  }, [])

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
      }
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
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

          {/* RBAC Role — required */}
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

          {/* Brand access */}
          <Field label="الوصول للعلامات التجارية">
            <div className="space-y-2">
              {BRANDS.map(b => (
                <label key={b.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="brand"
                    value={b.value}
                    checked={brandAccess === b.value}
                    onChange={() => setBrandAccess(b.value)}
                    className="accent-blue-500"
                  />
                  <span className={`text-sm ${brandAccess === b.value ? 'text-gray-900 font-medium' : 'text-gray-500'} group-hover:text-gray-900 transition-colors`}>
                    {b.label}
                  </span>
                </label>
              ))}
            </div>
          </Field>

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
