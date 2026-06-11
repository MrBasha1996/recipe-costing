import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Valid brands are fetched from DB per-request (table is small, changes rarely)
async function getValidBrands(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('brands').select('id')
  return (data ?? []).map((b: any) => b.id as string)
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

  const { data: { user } } = await supabase.auth.getUser()
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

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role_id, brand_access, roles(is_super_admin)')
    .eq('id', user.id)
    .single()

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

  const { data: perms } = await (supabase.from('role_permissions') as any)
    .select('can_view, modules!inner(code)')
    .eq('role_id', profile.role_id)

  const modulePerm = (perms as any[])?.find((p: any) => p.modules?.code === moduleCode)

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
