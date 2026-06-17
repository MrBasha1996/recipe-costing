'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import ProductTable from '@/components/products/ProductTable'
import ProductForm from '@/components/products/ProductForm'
import { exportProducts, importProducts, downloadProductsTemplate } from '@/lib/dataImportExport'
import type { Product, BrandId } from '@/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Props {
  initialProducts: Product[]
  brand: BrandId
}

export default function ProductsClient({ initialProducts, brand }: Props) {
  const router = useRouter()
  const { canEdit, canSeePrices } = useUserStore()
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // عند تغيير brand تأتي بيانات جديدة من السيرفر
  useEffect(() => { setProducts(initialProducts) }, [initialProducts])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.includes(search)
  )

  function handleEdit(p: Product) { setEditProduct(p); setShowForm(true) }
  function handleClose() { setShowForm(false); setEditProduct(null) }

  function handleDelete(p: Product) {
    setDlg({ msg: `حذف "${p.name}"؟`, onOk: async () => {
      const supabase = createClient()
      await supabase.from('products').delete().eq('sku', p.sku).eq('brand_id', p.brand_id)
      router.refresh()
    }})
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المنتجات</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} منتج</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm w-56 focus:outline-none focus:border-blue-500"
          />
          {canEdit('products') && (
            <>
              <button
                onClick={() => downloadProductsTemplate()}
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
              >
                📄 قالب
              </button>
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await exportProducts(brand, supabase)
                }}
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
              >
                ⬇ تصدير
              </button>
              <label className="cursor-pointer">
                <span className={`text-sm px-3 py-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors inline-block ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing ? 'جارٍ...' : '⬆ استيراد'}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setImporting(true)
                    setImportMsg(null)
                    const supabase = createClient()
                    try {
                      const res = await importProducts(file, brand, supabase)
                      setImportMsg(`مُضاف: ${res.inserted} | مُحدَّث: ${res.updated}${res.errors.length > 0 ? ` | أخطاء: ${res.errors.length}` : ''}`)
                      router.refresh()
                    } catch (e: any) {
                      setImportMsg(`خطأ: ${e.message}`)
                    } finally {
                      setImporting(false)
                    }
                  }}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => { setEditProduct(null); setShowForm(true) }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                + إضافة منتج
              </button>
            </>
          )}
        </div>
      </div>

      {importMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg border flex items-center justify-between ${importMsg.startsWith('خطأ') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} className="mr-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <ProductTable
        products={filtered}
        canEdit={canEdit('products')}
        canSeePrices={canSeePrices()}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {showForm && (
        <ProductForm
          brand={brand}
          product={editProduct}
          onClose={handleClose}
          onSaved={() => { handleClose(); router.refresh() }}
        />
      )}
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}
