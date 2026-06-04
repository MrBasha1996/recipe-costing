import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PATH_TO_MODULE: Record<string, string> = {
  '/dashboard':   'dashboard',
  '/costing':     'costing',
  '/products':    'products',
  '/ingredients': 'ingredients',
  '/purchasing':  'purchasing',
  '/sales':       'sales',
  '/waste':       'waste',
  '/costs':       'costs',
  '/reports':     'reports',
  '/comparison':  'comparison',
  '/inventory':   'inventory',
  '/users':       'users',
  '/roles':       'roles',
  '/settings':    'settings',
}

function getModuleForPath(pathname: string): string | null {
  for (const [path, mod] of Object.entries(PATH_TO_MODULE)) {
    if (pathname.startsWith(path)) return mod
  }
  return null
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
    if (user) return NextResponse.redirect(new URL('/costing', request.url))
    return supabaseResponse
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const moduleCode = getModuleForPath(pathname)
  if (!moduleCode) return supabaseResponse

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role_id, roles(is_super_admin)')
    .eq('id', user.id)
    .single()

  if ((profile?.roles as any)?.is_super_admin) return supabaseResponse

  if (!profile?.role_id) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: perms } = await (supabase.from('role_permissions') as any)
    .select('can_view, modules!inner(code)')
    .eq('role_id', profile.role_id)

  const modulePerm = (perms as any[])?.find((p: any) => p.modules?.code === moduleCode)

  if (!modulePerm?.can_view) {
    return NextResponse.redirect(new URL('/costing', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
