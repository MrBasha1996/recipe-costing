'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCostingStore } from '@/stores/costingStore'
import CostingSidebar from '@/components/costing/CostingSidebar'
import type { Product, BrandId } from '@/types'

const RecipeEditor = dynamic(() => import('@/components/costing/RecipeEditor'), { ssr: false })

export default function CostingPage() {
  const [mounted, setMounted] = useState(false)
  const { brand } = useParams() as { brand: BrandId }
  const { currentProduct, setCurrentProduct, reset } = useCostingStore()

  useEffect(() => { setMounted(true) }, [])

  function handleSelect(p: Product) {
    if (currentProduct?.sku === p.sku) return
    reset()
    setCurrentProduct(p)
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] -m-4 md:-m-6 print:m-0 print:h-auto overflow-hidden">
      {/* Sidebar */}
      <div className="print:hidden w-72 flex-shrink-0 overflow-hidden">
        <CostingSidebar
          brand={brand}
          mode="meals"
          selectedSku={currentProduct?.sku ?? null}
          onSelect={handleSelect}
        />
      </div>

      {/* Divider */}
      <div className="print:hidden w-px bg-gray-200 flex-shrink-0" />

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {mounted && <RecipeEditor />}
      </div>
    </div>
  )
}
