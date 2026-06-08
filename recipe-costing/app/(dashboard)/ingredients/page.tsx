import { getServerBrand } from '@/lib/server-brand'
import { createClient } from '@/lib/supabase/server'
import IngredientsClient from './IngredientsClient'
import type { Ingredient } from '@/types'

export default async function IngredientsPage() {
  const brand = await getServerBrand()
  const supabase = await createClient()

  const { data } = await supabase
    .from('ingredients')
    .select('*')
    .eq('brand_id', brand)
    .order('category')
    .order('name')

  return <IngredientsClient initialIngredients={(data as Ingredient[]) ?? []} brand={brand} />
}
