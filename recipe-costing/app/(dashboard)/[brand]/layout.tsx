import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'
import type { BrandId } from '@/types'

const VALID_BRANDS: BrandId[] = ['ti', 'bb']

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brand: string }>
}) {
  const { brand: brandParam } = await params

  if (!VALID_BRANDS.includes(brandParam as BrandId)) {
    redirect('/bb/costing')
  }

  const brand = brandParam as BrandId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <DashboardShell profile={profile} brand={brand}>
      {children}
    </DashboardShell>
  )
}
