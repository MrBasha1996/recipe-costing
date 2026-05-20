'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import type { UserProfile } from '@/types'

const NAV_ITEMS = [
  { key: 'costing',     icon: '📋', label: 'الوصفات',      href: '/costing',     roles: ['accountant','ops','kitchen'] },
  { key: 'products',    icon: '🛍', label: 'المنتجات',     href: '/products',    roles: ['accountant','ops'] },
  { key: 'ingredients', icon: '🥗', label: 'المواد الخام', href: '/ingredients', roles: ['accountant','ops'] },
  { key: 'comparison',  icon: '📊', label: 'مقارنة',       href: '/comparison',  roles: ['accountant'] },
  { key: 'inventory',   icon: '📦', label: 'المخزون',      href: '/inventory',   roles: ['accountant','ops'] },
  { key: 'dashboard',   icon: '📈', label: 'لوحة التحكم',  href: '/dashboard',   roles: ['accountant'] },
  { key: 'users',       icon: '👥', label: 'المستخدمون',   href: '/users',       roles: ['accountant'] },
  { key: 'settings',   icon: '⚙️', label: 'الإعدادات',    href: '/settings',    roles: ['accountant'] },
]

const ROLE_LABEL: Record<string, string> = {
  accountant: 'محاسب',
  ops: 'تشغيل',
  kitchen: 'مطبخ',
}

const SIDEBAR_W = 260

export default function DashboardShell({
  profile,
  children,
}: {
  profile: UserProfile
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { brand, setBrand } = useBrandStore()
  const { setProfile } = useUserStore()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    useBrandStore.persist.rehydrate()
    setProfile(profile)
    setMounted(true)
  }, [profile, setProfile])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(profile.role))
  const activeBrand = mounted ? brand : 'ti'
  const brandName = activeBrand === 'ti' ? 'Three In' : 'باب البلد'

  return (
    <div dir="rtl" suppressHydrationWarning style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* CSS: on desktop the sidebar is always visible and main content is offset */}
      <style>{`
        @media (min-width: 1024px) {
          .ds-sidebar { transform: translateX(0) !important; }
          .ds-main    { margin-right: ${SIDEBAR_W}px; }
        }
      `}</style>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className="ds-sidebar fixed top-0 right-0 h-screen bg-white border-l border-gray-200 z-40 transition-transform duration-300 flex flex-col"
        style={{
          width: SIDEBAR_W,
          transform: mobileOpen ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`,
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span className="text-lg font-bold bg-gradient-to-br from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Recipe Analytics
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 pr-8">نظام تكاليف الوصفات</p>
        </div>

        {/* Brand switcher */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400 mb-2 font-medium">العلامة التجارية</p>
          <div className="flex gap-1">
            {(profile.brand_access === 'all' || profile.brand_access === 'ti') && (
              <button
                onClick={() => setBrand('ti')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeBrand === 'ti'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Three In
              </button>
            )}
            {(profile.brand_access === 'all' || profile.brand_access === 'bb') && (
              <button
                onClick={() => setBrand('bb')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeBrand === 'bb'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                باب البلد
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {visibleNav.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item ${active ? 'active' : ''}`}
              >
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold flex-shrink-0">
                {profile.name_ar.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{profile.name_ar}</div>
                <div className="text-xs text-gray-400">{ROLE_LABEL[profile.role] ?? profile.role}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="خروج"
              className="text-gray-400 hover:text-red-500 transition-colors text-sm p-1.5 rounded flex-shrink-0"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <div className="ds-main flex flex-col min-h-screen">

        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between flex-shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden p-1.5 rounded text-gray-500 hover:bg-gray-100 text-lg"
              aria-label="القائمة"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-gray-700">
              {visibleNav.find(n => pathname.startsWith(n.href))?.label ?? 'لوحة التحكم'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                activeBrand === 'ti'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {brandName}
            </span>
            <span className="text-xs text-gray-600 font-medium">{profile.name_ar || profile.username}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
