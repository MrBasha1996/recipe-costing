'use client'

import dynamic from 'next/dynamic'
import { useCostingStore } from '@/stores/costingStore'
import CostingSidebar from '@/components/costing/CostingSidebar'
import type { Product } from '@/types'

const RecipeEditor = dynamic(() => import('@/components/costing/RecipeEditor'), { ssr: false })

export default function BatchCostingPage() {
  const { currentProduct, setCurrentProduct, reset } = useCostingStore()

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
          mode="batches"
          selectedSku={currentProduct?.sku ?? null}
          onSelect={handleSelect}
        />
      </div>

      {/* Divider */}
      <div className="print:hidden w-px bg-gray-200 flex-shrink-0" />

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <RecipeEditor />
      </div>
    </div>
  )
}
