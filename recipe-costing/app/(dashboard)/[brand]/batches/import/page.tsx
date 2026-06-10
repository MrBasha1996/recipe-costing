import type { BrandId } from '@/types'
import RecipeImportClient from '@/app/(dashboard)/[brand]/costing/import/RecipeImportClient'

export default async function BatchImportPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  return <RecipeImportClient brand={brand} mode="batch" />
}
