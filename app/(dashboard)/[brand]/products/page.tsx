import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import ProductsClient from './ProductsClient'
import type { Product } from '@/types'

export default async function ProductsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('brand_id', brand)
    .order('category')
    .order('name')

  return <ProductsClient initialProducts={(data as Product[]) ?? []} brand={brand} />
}
