import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Module-level TTL cache — survives across requests in the same process
const _brandsCache: { data: string[]; exp: number } = { data: [], exp: 0 }
const _permsCache  = new Map<string, { data: any[]; exp: number }>()
const _profileCache = new Map<string, { data: any; exp: number }>()
const BRANDS_TTL  = 60_000   // 1 min
const PERMS_TTL   = 60_000   // 1 min
const PROFILE_TTL = 30_000   // 30 sec

async function getValidBrands(supabase: any): Promise<string[]> {
  if (Date.now() < _brandsCache.exp) return _brandsCache.data
  const { data } = await supabase.from('brands').select('id')
  _brandsCache.data = (data ?? []).map((b: any) => b.id as string)
  _brandsCache.exp  = Date.now() + BRANDS_TTL
  return _brandsCache.data
}

async function getUserProfile(supabase: any, userId: string): Promise<any> {
  const cached = _profileCache.get(userId)
  if (cached && Date.now() < cached.exp) return cached.data
  const { data } = await (supabase.from('user_profiles') as any)
    .select('role_id, brand_access, roles(is_super_admin)')
    .eq('id', userId)
    .single()
  _profileCache.set(userId, { data, exp: Date.now() + PROFILE_TTL })
  return data
}

async function getRolePermissions(supabase: any, roleId: string): Promise<any[]> {
  const cached = _permsCache.get(roleId)
  if (cached && Date.now() < cached.exp) return cached.data
  const { data } = await (supabase.from('role_permissions') as any)
    .select('can_view, modules!inner(code)')
    .eq('role_id', roleId)
  const result = data ?? []
  _permsCache.set(roleId, { data: result, exp: Date.now() + PERMS_TTL })
  return result
}

// Map path segment → module code for RBAC check
const PATH_TO_MODULE: Record<string, string> = {
  'dashboard':   'dashboard',
  'costing':     'costing',
  'products':    'products',
  'ingredients': 'ingredients',
  'purchasing':  'purchasing',
  'sales':       'sales',
  'waste':       'waste',
  'costs':       'costs',
  'reports':     'reports',
  'comparison':  'comparison',
  'inventory':   'inventory',
  'batches':     'costing',
  'production':  'production',
  'suppliers':   'ingredients',
  'users':       'users',
  'roles':       'roles',
  'brands':      'brands',
  'branches':    'branches',
  'settings':    'settings',
  'conversions': 'ingredients',
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getSession() reads the JWT from the cookie locally — no network round-trip.
  // Security boundaries are enforced in layout (getUser) and API routes (requireModulePermission).
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/login')) {
    if (user) return NextResponse.redirect(new URL('/', request.url))
    return supabaseResponse
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Extract brand from URL: /{brand}/... → segments[1]
  const segments = pathname.split('/').filter(Boolean)
  const brandInUrl = segments[0]
  const pageSegment = segments[1] // e.g. 'costing', 'batches', etc.

  // Skip non-brand routes — validate against DB
  if (!brandInUrl) return supabaseResponse
  const validBrands = await getValidBrands(supabase)
  if (!validBrands.includes(brandInUrl)) return supabaseResponse

  const profile = await getUserProfile(supabase, user.id)

  if (!profile) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const brandAccess = profile?.brand_access as string

  // Enforce brand isolation: single-brand users must stay on their brand
  if (brandAccess !== 'all' && brandInUrl !== brandAccess) {
    const rest = segments.slice(1).join('/')
    return NextResponse.redirect(new URL(`/${brandAccess}/${rest || 'costing'}`, request.url))
  }

  if ((profile?.roles as any)?.is_super_admin) return supabaseResponse

  if (!profile?.role_id) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const moduleCode = pageSegment ? PATH_TO_MODULE[pageSegment] : null
  if (!moduleCode) return supabaseResponse

  const perms = await getRolePermissions(supabase, profile.role_id)

  const modulePerm = perms?.find((p: any) => p.modules?.code === moduleCode)

  if (!modulePerm?.can_view) {
    return NextResponse.redirect(new URL(`/${brandInUrl}/costing`, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
