import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes accessible by 'accountant' role only
const ACCOUNTANT_ONLY = ['/users', '/roles', '/dashboard', '/comparison', '/settings', '/purchasing', '/costs']

// Routes accessible by 'accountant' or 'ops'
const ACCOUNTANT_OPS = ['/inventory', '/sales', '/waste']

// Routes accessible by 'accountant' or 'management'
const ACCOUNTANT_MGMT = ['/reports']

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

  // /login — redirect authenticated users away
  if (pathname.startsWith('/login')) {
    if (user) return NextResponse.redirect(new URL('/costing', request.url))
    return supabaseResponse
  }

  // All other routes — must be authenticated
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const needsRoleCheck =
    ACCOUNTANT_ONLY.some(p => pathname.startsWith(p)) ||
    ACCOUNTANT_OPS.some(p => pathname.startsWith(p)) ||
    ACCOUNTANT_MGMT.some(p => pathname.startsWith(p))

  if (needsRoleCheck) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, role_id')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    if (profile?.role_id) {
      const { data: rbacRole } = await supabase
        .from('roles')
        .select('is_super_admin')
        .eq('id', profile.role_id)
        .single()

      if (rbacRole?.is_super_admin) return supabaseResponse
    }

    if (ACCOUNTANT_ONLY.some(p => pathname.startsWith(p)) && role !== 'accountant') {
      return NextResponse.redirect(new URL('/costing', request.url))
    }

    if (ACCOUNTANT_OPS.some(p => pathname.startsWith(p)) && role === 'kitchen') {
      return NextResponse.redirect(new URL('/costing', request.url))
    }

    if (ACCOUNTANT_MGMT.some(p => pathname.startsWith(p)) && role !== 'accountant' && role !== 'management') {
      return NextResponse.redirect(new URL('/costing', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
