import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { BrandId, ModifierGroup } from '@/types'
import ModifiersClient from './ModifiersClient'

export default async function ModifiersPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await (supabase.from('modifier_groups') as any)
    .select('*')
    .eq('brand_id', brand)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  return (
    <ModifiersClient
      initialGroups={(data ?? []) as ModifierGroup[]}
      brand={brand}
    />
  )
}
