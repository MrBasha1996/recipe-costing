import type { BrandId } from '@/types'
import RecipeImportClient from './RecipeImportClient'

export default async function RecipeImportPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  return <RecipeImportClient brand={brand} mode="meal" />
}
