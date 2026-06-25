import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import IngredientsClient from './IngredientsClient'
import type { Ingredient, UnitConversion } from '@/types'

export default async function IngredientsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const [{ data }, { data: conversions }] = await Promise.all([
    supabase.from('ingredients').select('*').eq('brand_id', brand).order('category').order('name'),
    (supabase as any).from('unit_conversions').select('*').eq('brand_id', brand),
  ])

  return (
    <IngredientsClient
      initialIngredients={(data as Ingredient[]) ?? []}
      initialConversions={(conversions as UnitConversion[]) ?? []}
      brand={brand}
    />
  )
}
