'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import IngredientTable from '@/components/ingredients/IngredientTable'
import IngredientForm from '@/components/ingredients/IngredientForm'
import PriceImpactModal from '@/components/shared/PriceImpactModal'
import { downloadPriceTemplate, parsePriceFile } from '@/lib/excel'
import type { Ingredient } from '@/types'
import type { PriceChange } from '@/lib/excel'

export default function IngredientsPage() {
  const { brand } = useBrandStore()
  const { canEdit, canSeePrices, isAccountant } = useUserStore()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editIngredient, setEditIngredient] = useState<Ingredient | null>(null)
  const [priceChanges, setPriceChanges] = useState<PriceChange[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .eq('brand_id', brand)
      .order('category')
      .order('name')
    setIngredients((data as Ingredient[]) || [])
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  const categories = ['all', ...Array.from(new Set(ingredients.map(i => i.category))).sort()]

  const filtered = ingredients.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.includes(search)
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter
    return matchSearch && matchCat
  })

  function handleEdit(i: Ingredient) { setEditIngredient(i); setShowForm(true) }
  function handleClose() { setShowForm(false); setEditIngredient(null) }

  async function handleDelete(i: Ingredient) {
    if (!confirm(`حذف "${i.name}"؟`)) return
    const supabase = createClient()
    await supabase.from('ingredients').delete().eq('sku', i.sku).eq('brand_id', i.brand_id)
    load()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return
    setParseError(null)
    try {
      const changes = await parsePriceFile(file)
      if (changes.length === 0) {
        setParseError('لم يتم العثور على تغييرات في الملف. تأكد من تعبئة عمود "التكلفة الجديدة".')
        return
      }
      setPriceChanges(changes)
    } catch (err: any) {
      setParseError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المواد الخام</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} مكوّن</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm w-44 focus:outline-none focus:border-blue-500"
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'كل الفئات' : c}</option>
            ))}
          </select>

          {/* Excel buttons — accountant only */}
          {isAccountant() && (
            <>
              <button
                onClick={() => downloadPriceTemplate(ingredients).catch(console.error)}
                disabled={ingredients.length === 0}
                className="text-sm px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors"
                title="تحميل قالب Excel لتحديث الأسعار"
              >
                ⬇ Template
              </button>
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors inline-block">
                  ⬆ استيراد أسعار
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </>
          )}

          {canEdit('ingredients') && (
            <button
              onClick={() => { setEditIngredient(null); setShowForm(true) }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + إضافة مادة
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-600 text-sm flex items-center justify-between">
          <span>{parseError}</span>
          <button onClick={() => setParseError(null)} className="text-red-400 hover:text-red-600 mr-2">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">جارٍ التحميل...</div>
        </div>
      ) : (
        <IngredientTable
          ingredients={filtered}
          canEdit={canEdit('ingredients')}
          canSeePrices={canSeePrices()}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {showForm && (
        <IngredientForm
          brand={brand}
          ingredient={editIngredient}
          onClose={handleClose}
          onSaved={() => { handleClose(); load() }}
        />
      )}

      {priceChanges && (
        <PriceImpactModal
          changes={priceChanges}
          onClose={() => setPriceChanges(null)}
          onApplied={() => { setPriceChanges(null); load() }}
        />
      )}
    </div>
  )
}
