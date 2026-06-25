'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import BrandSelectorOverlay from '@/components/BrandSelectorOverlay'
import { GlobalLoadingProvider } from '@/contexts/globalLoading'
import type { UserProfile, BrandId, PermissionsMap } from '@/types'

type NavGroup = 'ops' | 'analytics' | 'admin'

const NAV_BASE: { key: string; icon: string; label: string; path: string; group: NavGroup }[] = [
  { key: 'dashboard',   icon: '📈', label: 'لوحة التحكم',   path: '/dashboard',  group: 'ops' },
  { key: 'costing',     icon: '📋', label: 'الوصفات',       path: '/costing',    group: 'ops' },
  { key: 'batches',     icon: '⚙', label: 'الباتشات',      path: '/batches',    group: 'ops' },
  { key: 'products',    icon: '🛍', label: 'المنتجات',       path: '/products',   group: 'ops' },
  { key: 'combos',      icon: '🍱', label: 'وجبات الكومبو',  path: '/combos',     group: 'ops' },
  { key: 'modifiers',   icon: '➕', label: 'الإضافات',       path: '/modifiers',  group: 'ops' },
  { key: 'ingredients', icon: '🥗', label: 'المواد الخام',   path: '/ingredients',group: 'ops' },
  { key: 'purchasing',  icon: '🛒', label: 'المشتريات',     path: '/purchasing', group: 'ops' },
  { key: 'sales',       icon: '💰', label: 'المبيعات',      path: '/sales',      group: 'ops' },
  { key: 'waste',       icon: '🗑', label: 'الهدر والفاقد', path: '/waste',      group: 'ops' },
  { key: 'costs',       icon: '🏗', label: 'التكاليف',      path: '/costs',      group: 'ops' },
  { key: 'inventory',   icon: '📦', label: 'المخزون',       path: '/inventory',  group: 'ops' },
  { key: 'production',  icon: '⚙️', label: 'الإنتاج',       path: '/production', group: 'ops' },
  { key: 'reports',     icon: '📊', label: 'التقارير',      path: '/reports',    group: 'analytics' },
  { key: 'comparison',  icon: '↔️', label: 'مقارنة',        path: '/comparison', group: 'analytics' },
  { key: 'suppliers',   icon: '🏭', label: 'الموردون',      path: '/suppliers',  group: 'analytics' },
  { key: 'users',       icon: '👥', label: 'المستخدمون',    path: '/users',      group: 'admin' },
  { key: 'roles',       icon: '🔐', label: 'المجموعات',     path: '/roles',      group: 'admin' },
  { key: 'brands',      icon: '🏢', label: 'البراندات',     path: '/brands',     group: 'admin' },
  { key: 'branches',    icon: '🏪', label: 'الفروع',        path: '/branches',   group: 'admin' },
  { key: 'settings',    icon: '⚙️', label: 'الإعدادات',     path: '/settings',   group: 'admin' },
]

const GROUP_LABELS: Record<NavGroup, string> = {
  ops:       'التشغيل',
  analytics: 'التحليل',
  admin:     'الإدارة',
}

const SIDEBAR_W = 260

// ── Brand color helpers ───────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function buildBrandStyle(
  primary: string | null | undefined,
  sidebar: string | null | undefined,
  secondary: string | null | undefined,
): React.CSSProperties {
  const p = hexToRgb(primary ?? '')
  if (!p) return {}
  const [pr, pg, pb] = p
  const s = hexToRgb(sidebar ?? '')
  const [sr, sg, sb] = s ?? [Math.round(pr * .08), Math.round(pg * .08), Math.round(pb * .08)]
  const c = hexToRgb(secondary ?? '')
  const [cr, cg, cb] = c ?? [pr, pg, pb]
  return {
    '--brand-sidebar-bg':      `rgb(${sr},${sg},${sb})`,
    '--brand-sidebar-border':  `rgba(${sr},${sg},${sb},0.6)`,
    '--brand-logo-from':       `rgba(${sr},${sg},${sb},0.7)`,
    '--brand-logo-to':         primary!,
    '--brand-nav-hover-bg':    `rgba(${cr},${cg},${cb},0.12)`,
    '--brand-nav-hover-text':  `rgba(${cr},${cg},${cb},0.85)`,
    '--brand-nav-active-bg':   `rgba(${pr},${pg},${pb},0.22)`,
    '--brand-nav-active-text': '#ffffff',
    '--brand-nav-active-bar':  primary!,
    '--brand-nav-text':        `rgba(${cr},${cg},${cb},0.6)`,
    '--brand-accent':          primary!,
    '--brand-badge-bg':        `rgba(${cr},${cg},${cb},0.15)`,
    '--brand-badge-text':      `rgba(${cr},${cg},${cb},0.9)`,
    '--brand-switcher-active': primary!,
    '--brand-header-accent':   `rgb(${Math.round(sr * .7)},${Math.round(sg * .7)},${Math.round(sb * .7)})`,
  } as React.CSSProperties
}

// ── Alerts ────────────────────────────────────────────────────────
type AlertType = 'empty' | 'low' | 'expired' | 'expiring'
interface Alert { type: AlertType; sku: string; name: string; detail: string }

const ALERT_ICON:  Record<AlertType, string> = { empty: '🔴', low: '🟡', expired: '🔴', expiring: '🟠' }
const ALERT_LABEL: Record<AlertType, string> = { empty: 'نفد المخزون', low: 'منخفض', expired: 'منتهي الصلاحية', expiring: 'يقترب الانتهاء' }
const ALERT_COLOR: Record<AlertType, string> = { empty: 'text-red-600', low: 'text-amber-600', expired: 'text-red-600', expiring: 'text-orange-600' }

export default function DashboardShell({
  profile,
  brand,
  brandMeta,
  initialPermissions,
  isSuperAdmin,
  roleName: roleNameProp,
  children,
}: {
  profile: UserProfile
  brand: BrandId
  brandMeta: { name: string; name_ar: string; primary_color?: string | null; sidebar_color?: string | null; secondary_color?: string | null; logo_url?: string | null } | null
  initialPermissions: PermissionsMap
  isSuperAdmin: boolean
  roleName: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { setProfile } = useUserStore()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])

  const hasMultiBrand = profile.brand_access === 'all'

  // Build nav items with brand prefix in href
  const NAV_ITEMS = NAV_BASE.map(n => ({ ...n, href: `/${brand}${n.path}` }))

  useEffect(() => {
    setProfile(profile)
    setMounted(true)
    // Hydrate store from server-fetched data — no client-side round-trips
    usePermissionsStore.getState().initFromServer(initialPermissions, isSuperAdmin, roleNameProp)
    // Subscribe to realtime changes for live permission updates
    if (profile?.id) {
      const supabase = createClient()
      usePermissionsStore.getState().subscribeToChanges(profile.id, supabase)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // تحميل الإنذارات وتجديدها كل دقيقتين
  useEffect(() => {
    if (!mounted) return
    loadAlerts(brand)
    const interval = setInterval(() => loadAlerts(brand), 120000)
    return () => clearInterval(interval)
  }, [mounted, brand])

  function handleBrandPick(b: BrandId) {
    setShowSelector(false)
    fetch('/api/session/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: b }),
    })
    router.push(`/${b}/costing`)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    await fetch('/api/session/brand', { method: 'DELETE' })
    router.push('/login')
  }

  async function loadAlerts(brandId: string) {
    const supabase = createClient()
    const todayStr = new Date().toLocaleDateString('en-CA')
    const in3Str   = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA')
    const { data: stocks } = await (supabase.from('stock_items') as any)
      .select('ing_sku, ing_name, current_qty, min_qty, expiry_date')
      .eq('brand_id', brandId)
      .or('min_qty.gt.0,expiry_date.not.is.null')
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

  const hasPermission = usePermissionsStore(s => s.hasPermission)
  const permLoaded    = usePermissionsStore(s => s.loaded)
  const roleName      = usePermissionsStore(s => s.roleName)

  const visibleNav = permLoaded
    ? NAV_ITEMS.filter(n => hasPermission(n.key, 'view'))
    : []

  // Redirect to first accessible page if the current URL is not permitted
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!mounted || !permLoaded) return
    const match = NAV_ITEMS.find(n => pathname.startsWith(n.href))
    if (match && !hasPermission(match.key, 'view')) {
      const first = NAV_ITEMS.find(n => hasPermission(n.key, 'view'))
      router.replace(first?.href ?? `/${brand}/costing`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, permLoaded, pathname, profile.role_id])

  const brandCss = (() => {
    const s = buildBrandStyle(
      brandMeta?.primary_color,
      brandMeta?.sidebar_color,
      brandMeta?.secondary_color,
    )
    if (!Object.keys(s).length) return ''
    return `[data-brand="${brand}"]{${Object.entries(s).map(([k, v]) => `${k}:${v}`).join(';')}}`
  })()

  const brandConfig = {
    name:      brandMeta?.name_ar ?? brand,
    tagline:   brandMeta?.name ?? '',
    logoUrl:   brandMeta?.logo_url ?? null,
    accentBar: 'linear-gradient(to left, var(--brand-header-accent), var(--brand-nav-active-bar), var(--brand-badge-text))',
  }

  return (
    <GlobalLoadingProvider>
    {brandCss && <style>{brandCss}</style>}
    <div dir="rtl" data-brand={brand} suppressHydrationWarning style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Brand Selector Overlay */}
      <BrandSelectorOverlay
        visible={showSelector}
        currentBrand={brand}
        onPick={handleBrandPick}
        onClose={() => setShowSelector(false)}
        canClose={true}
      />

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
              className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden"
              style={{ background: 'var(--brand-nav-active-bg)', border: '1px solid var(--brand-nav-active-bar)' }}
            >
              {brandConfig.logoUrl ? (
                <img src={brandConfig.logoUrl} alt={brandConfig.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold text-base">
                  {brandConfig.name.charAt(0)}
                </div>
              )}
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
                {brandConfig.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--brand-nav-text)' }}>تغيير ↗</span>
            </button>
          ) : (
            <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--brand-badge-bg)', color: 'var(--brand-badge-text)' }}>
              {brandConfig.name}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {(['ops', 'analytics', 'admin'] as NavGroup[]).map(group => {
            const groupItems = visibleNav.filter(n => n.group === group)
            if (groupItems.length === 0) return null
            return (
              <div key={group} className="mb-3">
                <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-nav-text)', opacity: 0.5 }}>
                  {GROUP_LABELS[group]}
                </div>
                <div className="space-y-0.5">
                  {groupItems.map(item => {
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
                </div>
              </div>
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
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              className="p-1.5 rounded transition-colors flex-shrink-0 text-sm flex items-center gap-1"
              style={{ color: 'var(--brand-nav-text)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-nav-text)')}
            >
              <span aria-hidden="true">⏻</span>
              <span className="text-xs">خروج</span>
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
                  <div className="absolute end-0 top-9 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
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
                          <Link key={i} href={`/${brand}/inventory`} onClick={() => setShowAlerts(false)}
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
                        <Link href={`/${brand}/inventory`} onClick={() => setShowAlerts(false)}
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
              {brandConfig.name}
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
    </GlobalLoadingProvider>
  )
}
