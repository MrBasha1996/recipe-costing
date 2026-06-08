'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import BrandSelectorOverlay from '@/components/BrandSelectorOverlay'
import type { UserProfile, BrandId } from '@/types'

const NAV_ITEMS = [
  { key: 'dashboard',   icon: '📈', label: 'لوحة التحكم',   href: '/dashboard' },
  { key: 'costing',     icon: '📋', label: 'الوصفات',       href: '/costing' },
  { key: 'batches',     icon: '⚙', label: 'الباتشات',      href: '/batches' },
  { key: 'products',    icon: '🛍', label: 'المنتجات',      href: '/products' },
  { key: 'ingredients', icon: '🥗', label: 'المواد الخام',  href: '/ingredients' },
  { key: 'purchasing',  icon: '🛒', label: 'المشتريات',     href: '/purchasing' },
  { key: 'sales',       icon: '💰', label: 'المبيعات',      href: '/sales' },
  { key: 'waste',       icon: '🗑', label: 'الهدر والفاقد', href: '/waste' },
  { key: 'costs',       icon: '🏗', label: 'التكاليف',      href: '/costs' },
  { key: 'reports',     icon: '📊', label: 'التقارير',      href: '/reports' },
  { key: 'comparison',  icon: '↔️', label: 'مقارنة',        href: '/comparison' },
  { key: 'inventory',   icon: '📦', label: 'المخزون',       href: '/inventory' },
  { key: 'production',  icon: '⚙️', label: 'الإنتاج',       href: '/production' },
  { key: 'suppliers',   icon: '🏭', label: 'الموردون',      href: '/suppliers' },
  { key: 'users',       icon: '👥', label: 'المستخدمون',    href: '/users' },
  { key: 'roles',       icon: '🔐', label: 'المجموعات',     href: '/roles' },
  { key: 'settings',    icon: '⚙️', label: 'الإعدادات',     href: '/settings' },
]

const SIDEBAR_W = 260

// ── Alerts ────────────────────────────────────────────────────────
type AlertType = 'empty' | 'low' | 'expired' | 'expiring'
interface Alert { type: AlertType; sku: string; name: string; detail: string }

const ALERT_ICON:  Record<AlertType, string> = { empty: '🔴', low: '🟡', expired: '🔴', expiring: '🟠' }
const ALERT_LABEL: Record<AlertType, string> = { empty: 'نفد المخزون', low: 'منخفض', expired: 'منتهي الصلاحية', expiring: 'يقترب الانتهاء' }
const ALERT_COLOR: Record<AlertType, string> = { empty: 'text-red-600', low: 'text-amber-600', expired: 'text-red-600', expiring: 'text-orange-600' }

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
  const [showAlerts, setShowAlerts] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])

  const hasMultiBrand = profile.brand_access === 'all'

  useEffect(() => {
    useBrandStore.persist.rehydrate()
    // localStorage is sync — rehydrate completes before this line
    useBrandStore.getState().setHydrated(true)
    // Force single-brand users to their allowed brand regardless of persisted value
    if (profile.brand_access !== 'all') {
      useBrandStore.getState().setBrand(profile.brand_access as BrandId)
    }
    setProfile(profile)
    setMounted(true)
    // Load RBAC permissions once after login
    if (profile?.id) {
      const supabase = createClient()
      usePermissionsStore.getState().loadPermissions(profile.id, supabase)
    }
  }, [profile, setProfile])

  // Show selector on first login if user has access to multiple brands
  useEffect(() => {
    if (!mounted) return
    if (hasMultiBrand && !brandPicked) {
      setShowSelector(true)
    }
  }, [mounted, hasMultiBrand, brandPicked])

  // تحميل الإنذارات وتجديدها كل دقيقتين
  useEffect(() => {
    if (!mounted) return
    const activeBrand = useBrandStore.getState().brand
    if (!activeBrand) return
    loadAlerts(activeBrand)
    const interval = setInterval(() => loadAlerts(activeBrand), 120000)
    return () => clearInterval(interval)
  }, [mounted, brand])

  function handleBrandPick(b: BrandId) {
    pickBrand(b)
    setShowSelector(false)
    router.refresh()
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function loadAlerts(brandId: string) {
    const supabase = createClient()
    const todayStr = new Date().toLocaleDateString('en-CA')
    const in3Str   = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA')
    const { data: stocks } = await (supabase.from('stock_items') as any)
      .select('ing_sku, ing_name, current_qty, min_qty, expiry_date')
      .eq('brand_id', brandId)
    if (!stocks?.length) return
    const newAlerts: Alert[] = []
    for (const s of stocks as any[]) {
      if (s.min_qty > 0 && s.current_qty <= 0)
        newAlerts.push({ type: 'empty',   sku: s.ing_sku, name: s.ing_name, detail: 'المخزون صفر' })
      else if (s.min_qty > 0 && s.current_qty <= s.min_qty)
        newAlerts.push({ type: 'low',     sku: s.ing_sku, name: s.ing_name, detail: `${s.current_qty.toFixed(2)} (الحد: ${s.min_qty})` })
      if (s.expiry_date && s.current_qty > 0) {
        if (s.expiry_date < todayStr)
          newAlerts.push({ type: 'expired',  sku: s.ing_sku, name: s.ing_name, detail: `انتهت ${s.expiry_date}` })
        else if (s.expiry_date <= in3Str)
          newAlerts.push({ type: 'expiring', sku: s.ing_sku, name: s.ing_name, detail: `تنتهي ${s.expiry_date}` })
      }
    }
    setAlerts(newAlerts)
  }

  const { hasPermission, loaded: permLoaded, roleName } = usePermissionsStore()

  const visibleNav = permLoaded
    ? NAV_ITEMS.filter(n => hasPermission(n.key, 'view'))
    : []

  // Redirect to first accessible page if the current URL is not permitted
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!mounted || !permLoaded) return
    const match = NAV_ITEMS.find(n => n.href !== '/' && pathname.startsWith(n.href))
    if (match && !hasPermission(match.key, 'view')) {
      const first = NAV_ITEMS.find(n => hasPermission(n.key, 'view'))
      router.replace(first?.href ?? '/costing')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, permLoaded, pathname, profile.role_id])
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
                <div className="text-xs" style={{ color: 'var(--brand-nav-text)' }}>{roleName ?? '—'}</div>
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
            {/* جرس الإنذارات */}
            <div className="relative">
              <button
                onClick={() => setShowAlerts(v => !v)}
                className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                title="الإنذارات"
              >
                <span className="text-base">🔔</span>
                {alerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {alerts.length > 99 ? '99+' : alerts.length}
                  </span>
                )}
              </button>

              {showAlerts && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAlerts(false)} />
                  <div className="absolute left-0 top-9 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <span className="font-semibold text-gray-900 text-sm">الإنذارات</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alerts.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {alerts.length > 0 ? `${alerts.length} تنبيه` : 'لا تنبيهات'}
                      </span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {alerts.length === 0 ? (
                        <div className="px-4 py-8 text-center text-green-600 text-sm">النظام سليم ✓</div>
                      ) : (
                        alerts.map((a, i) => (
                          <Link key={i} href="/inventory" onClick={() => setShowAlerts(false)}
                            className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                            <span className="text-base flex-shrink-0 mt-0.5">{ALERT_ICON[a.type]}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{a.name}</div>
                              <div className={`text-xs mt-0.5 ${ALERT_COLOR[a.type]}`}>{ALERT_LABEL[a.type]} — {a.detail}</div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                    {alerts.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                        <Link href="/inventory" onClick={() => setShowAlerts(false)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          عرض المخزون كاملاً →
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

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
