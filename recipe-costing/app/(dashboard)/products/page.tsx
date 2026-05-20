'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import ProductTable from '@/components/products/ProductTable'
import ProductForm from '@/components/products/ProductForm'
import type { Product } from '@/types'

export default function ProductsPage() {
  const { brand } = useBrandStore()
  const { canEdit, canSeePrices } = useUserStore()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('brand_id', brand)
      .order('category')
      .order('name')
    setProducts((data as Product[]) || [])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.includes(search)
  )

  function handleEdit(p: Product) {
    setEditProduct(p)
    setShowForm(true)
  }

  function handleClose() {
    setShowForm(false)
    setEditProduct(null)
  }

  async function handleDelete(p: Product) {
    if (!confirm(`حذف "${p.name}"؟`)) return
    const supabase = createClient()
    await supabase.from('products').delete().eq('sku', p.sku).eq('brand_id', p.brand_id)
    load()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المنتجات</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} منتج</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm w-56 focus:outline-none focus:border-blue-500"
          />
          {canEdit() && (
            <button
              onClick={() => { setEditProduct(null); setShowForm(true) }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + إضافة منتج
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-400">جارٍ التحميل...</div>
        </div>
      ) : (
        <ProductTable
          products={filtered}
          canEdit={canEdit()}
          canSeePrices={canSeePrices()}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Form Modal */}
      {showForm && (
        <ProductForm
          brand={brand}
          product={editProduct}
          onClose={handleClose}
          onSaved={() => { handleClose(); load() }}
        />
      )}
    </div>
  )
}
