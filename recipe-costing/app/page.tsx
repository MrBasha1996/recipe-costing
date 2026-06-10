import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const VALID_BRANDS = ['ti', 'bb']

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('brand_access')
    .eq('id', user.id)
    .single()

  const brandAccess = (profile as any)?.brand_access ?? 'bb'

  let brand: string
  if (brandAccess === 'all') {
    const cookieStore = await cookies()
    const last = cookieStore.get('brand_session')?.value
    brand = last && VALID_BRANDS.includes(last) ? last : 'bb'
  } else {
    brand = brandAccess
  }

  redirect(`/${brand}/costing`)
}
