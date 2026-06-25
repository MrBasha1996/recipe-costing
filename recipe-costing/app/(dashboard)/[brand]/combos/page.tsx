import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { BrandId, ComboMeal } from '@/types'
import CombosClient from './CombosClient'

export default async function CombosPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await (supabase.from('combo_meals') as any)
    .select('*, combo_meal_items(*)')
    .eq('brand_id', brand)
    .order('created_at', { ascending: false })

  return (
    <CombosClient
      initialCombos={(data ?? []) as ComboMeal[]}
      brand={brand}
    />
  )
}
