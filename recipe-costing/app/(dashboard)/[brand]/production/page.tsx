'use client'

import { useParams } from 'next/navigation'
import type { BrandId } from '@/types'
import ProductionClient from './ProductionClient'

export default function ProductionPage() {
  const params = useParams()
  const brand = (params?.brand ?? '') as BrandId
  return <ProductionClient brand={brand} />
}
