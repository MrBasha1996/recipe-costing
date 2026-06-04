'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import BrandSelectorOverlay from '@/components/BrandSelectorOverlay'
import type { UserProfile, BrandId } from '@/types'

const NAV_ITEMS = [
  { key: 'costing',     icon: '📋', label: 'الوصفات',       href: '/costing',     roles: ['accountant','ops','kitchen','management'] },
  { key: 'products',    icon: '🛍', label: 'المنتجات',      href: '/products',    roles: ['accountant','ops'] },
  { key: 'ingredients', icon: '🥗', label: 'المواد الخام',  href: '/ingredients', roles: ['accountant','ops'] },
  { key: 'purchasing',  icon: '🛒', label: 'المشتريات',     href: '/purchasing',  roles: ['accountant'] },
  { key: 'sales',       icon: '💰', label: 'المبيعات',      href: '/sales',       roles: ['accountant','ops'] },
  { key: 'costs',       icon: '🏗', label: 'التكاليف',      href: '/costs',       roles: ['accountant'] },
  { key: 'reports',     icon: '📊', label: 'التقارير',      href: '/reports',     roles: ['accountant','management'] },
  { key: 'comparison',  icon: '↔️', label: 'مقارنة',        href: '/comparison',  roles: ['accountant'] },
  { key: 'inventory',   icon: '📦', label: 'المخزون',       href: '/inventory',   roles: ['accountant','ops'] },
  { key: 'dashboard',   icon: '📈', label: 'لوحة التحكم',   href: '/dashboard',   roles: ['accountant'] },
  { key: 'users',       icon: '👥', label: 'المستخدمون',    href: '/users',       roles: ['accountant'] },
  { key: 'settings',    icon: '⚙️', label: 'الإعدادات',     href: '/settings',    roles: ['accountant'] },
]

const ROLE_LABEL: Record<string, string> = {
  accountant:  'محاسب',
  management:  'إدارة عليا',
  ops:         'تشغيل',
  kitchen:     'مطبخ',
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
  const { brand, brandPicked, setBrand, pickBrand, resetPick } = useBrandStore()
  const { setProfile } = useUserStore()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSelector, setShowSelector] = useState(false)

  const hasMultiBrand = profile.brand_access === 'all'

  useEffect(() => {
    useBrandStore.persist.rehydrate()
    setProfile(profile)
    setMounted(true)
  }, [profile, setProfile])

  // Show selector on first login if user has access to multiple brands
  useEffect(() => {
    if (!mounted) return
    if (hasMultiBrand && !brandPicked) {
      setShowSelector(true)
    }
  }, [mounted, hasMultiBrand, brandPicked])

  function handleBrandPick(b: BrandId) {
    pickBrand(b)
    setShowSelector(false)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(profile.role))
  const activeBrand = mounted ? brand : 'ti'
  const brandName = activeBrand === 'ti' ? 'Three In' : 'باب البلد'

  const brandConfig = activeBrand === 'ti'
    ? {
        name:       'Three In',
        nameAr:     'ثري إن',
        icon:       '🍔',
        tagline:    'Burger & Steak',
        headerBg:   '#0e1f2e',
        accentBar:  'linear-gradient(to left, #1e40af, #3b82f6, #60a5fa)',
      }
    : {
        name:       'باب البلد',
        nameAr:     'Bab Al Balad',
        icon:       '🫕',
        tagline:    'المطبخ العربي الأصيل',
        headerBg:   '#1c0f00',
        accentBar:  'linear-gradient(to left, #92400e, #d97706, #fbbf24)',
      }

  return (
    <div dir="rtl" data-brand={activeBrand} suppressHydrationWarning style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Brand Selector Overlay */}
      <BrandSelectorOverlay
        visible={showSelector}
        currentBrand={activeBrand}
        onPick={handleBrandPick}
        onClose={() => setShowSelector(false)}
        canClose={brandPicked}
      />

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
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className="ds-sidebar fixed top-0 right-0 h-screen z-40 transition-all duration-300 flex flex-col"
        style={{
          width: SIDEBAR_W,
          background: 'var(--brand-sidebar-bg)',
          borderLeft: '1px solid var(--brand-sidebar-border)',
          transform: mobileOpen ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`,
        }}
      >
        {/* Brand Header */}
        <div
          className="flex-shrink-0 px-5 py-5"
          style={{ borderBottom: '1px solid var(--brand-sidebar-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'var(--brand-nav-active-bg)', border: '1px solid var(--brand-nav-active-bar)' }}
            >
              {brandConfig.icon}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white text-sm leading-tight">{brandConfig.name}</div>
              <div className="text-xs leading-tight" style={{ color: 'var(--brand-nav-text)' }}>
                {brandConfig.tagline}
              </div>
            </div>
          </div>
          {/* Accent bar */}
          <div className="h-0.5 rounded-full mt-4" style={{ background: brandConfig.accentBar }} />
        </div>

        {/* Brand label in sidebar */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--brand-sidebar-border)' }}>
          {hasMultiBrand ? (
            <button
              onClick={() => setShowSelector(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all"
              style={{
                background: 'var(--brand-badge-bg)',
                border: '1px solid var(--brand-nav-active-bar)',
                cursor: 'pointer',
              }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--brand-badge-text)' }}>
                {brandConfig.icon} {brandConfig.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--brand-nav-text)' }}>تغيير ↗</span>
            </button>
          ) : (
            <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--brand-badge-bg)', color: 'var(--brand-badge-text)' }}>
              {brandConfig.icon} {brandConfig.name}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
          {visibleNav.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item ${active ? 'active' : ''}`}
              >
                <span className="text-base w-5 text-center flex-shrink-0 opacity-90">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div
          className="px-4 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid var(--brand-sidebar-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'var(--brand-nav-active-bg)', color: 'var(--brand-nav-active-bar)', border: '1px solid var(--brand-nav-active-bar)' }}
              >
                {profile.name_ar.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate text-white">{profile.name_ar}</div>
                <div className="text-xs" style={{ color: 'var(--brand-nav-text)' }}>{ROLE_LABEL[profile.role] ?? profile.role}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="خروج"
              className="p-1.5 rounded transition-colors flex-shrink-0 text-sm"
              style={{ color: 'var(--brand-nav-text)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-nav-text)')}
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
            {/* Brand indicator bar */}
            <div
              className="hidden lg:block w-1 h-6 rounded-full"
              style={{ background: brandConfig.accentBar }}
            />
            <span className="text-sm font-medium text-gray-700">
              {visibleNav.find(n => pathname.startsWith(n.href))?.label ?? 'لوحة التحكم'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => hasMultiBrand && setShowSelector(true)}
              className="text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 transition-all"
              style={{
                background: 'var(--brand-badge-bg)',
                color: 'var(--brand-badge-text)',
                border: '1px solid var(--brand-nav-active-bar)',
                cursor: hasMultiBrand ? 'pointer' : 'default',
              }}
              title={hasMultiBrand ? 'تغيير البراند' : undefined}
            >
              {brandConfig.icon} {brandConfig.name}
              {hasMultiBrand && <span style={{ opacity: 0.6, fontSize: 10 }}>↗</span>}
            </button>
            <span className="text-xs text-gray-500 font-medium hidden sm:block">{profile.name_ar || profile.username}</span>
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
