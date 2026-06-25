import type { BrandId } from '@/types'
import BatchesClient from './BatchesClient'

export default async function BatchesPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  return <BatchesClient brand={brand} />
}
