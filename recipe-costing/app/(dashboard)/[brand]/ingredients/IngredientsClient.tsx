'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import IngredientTable from '@/components/ingredients/IngredientTable'
import IngredientForm from '@/components/ingredients/IngredientForm'
import PriceImpactModal from '@/components/shared/PriceImpactModal'
import { downloadPriceTemplate, parsePriceFile } from '@/lib/excel'
import { exportIngredients, importIngredients, downloadIngredientsTemplate } from '@/lib/dataImportExport'
import type { Ingredient, BrandId, UnitConversion } from '@/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { PriceChange } from '@/lib/excel'

interface Props {
  initialIngredients: Ingredient[]
  initialConversions: UnitConversion[]
  brand: BrandId
}

export default function IngredientsClient({ initialIngredients, initialConversions, brand }: Props) {
  const router = useRouter()
  const { canEdit, canSeePrices, isAccountant } = useUserStore()
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients)
  const [conversions, setConversions] = useState<UnitConversion[]>(initialConversions)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editIngredient, setEditIngredient] = useState<Ingredient | null>(null)
  const [priceChanges, setPriceChanges] = useState<PriceChange[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [showUnlinked, setShowUnlinked] = useState(false)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)
  const [linkedSkus, setLinkedSkus] = useState<Set<string> | null>(null)
  const [loadingUnlinked, setLoadingUnlinked] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dataFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setIngredients(initialIngredients) }, [initialIngredients])
  useEffect(() => { setConversions(initialConversions) }, [initialConversions])

  async function toggleUnlinked() {
    if (showUnlinked) { setShowUnlinked(false); return }
    if (linkedSkus === null) {
      setLoadingUnlinked(true)
      const supabase = createClient()
      const { data } = await (supabase.from('recipe_items') as any)
        .select('ing_sku')
        .eq('brand_id', brand)
      const skuSet = new Set<string>((data || []).map((r: any) => r.ing_sku as string))
      setLinkedSkus(skuSet)
      setLoadingUnlinked(false)
    }
    setShowUnlinked(true)
  }

  const convMap = useMemo(() => {
    const m = new Map<string, UnitConversion>()
    for (const c of conversions) m.set(c.ing_sku, c)
    return m
  }, [conversions])

  const categories = ['all', ...Array.from(new Set(ingredients.map(i => i.category))).sort()]
  const filtered = ingredients.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.includes(search)
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter
    const matchUnlinked = !showUnlinked || (linkedSkus !== null && !linkedSkus.has(i.sku))
    return matchSearch && matchCat && matchUnlinked
  })

  function handleEdit(i: Ingredient) { setEditIngredient(i); setShowForm(true) }
  function handleClose() { setShowForm(false); setEditIngredient(null) }

  function handleDelete(i: Ingredient) {
    setDlg({ msg: `حذف "${i.name}"؟`, onOk: async () => {
      const supabase = createClient()
      await supabase.from('ingredients').delete().eq('sku', i.sku).eq('brand_id', i.brand_id)
      router.refresh()
    }})
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
          <p className="text-gray-500 text-sm mt-0.5">
            {filtered.length} مكوّن
            {showUnlinked && <span className="mr-2 text-orange-600 font-medium"> — غير مرتبطة بوصفات</span>}
          </p>
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

          <button
            onClick={toggleUnlinked}
            disabled={loadingUnlinked}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${showUnlinked ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            title="عرض الأصناف غير المرتبطة بأي وصفة"
          >
            {loadingUnlinked ? '...' : showUnlinked ? '✕ إلغاء الفلتر' : '⚠ غير مرتبطة بوصفات'}
          </button>

          {isAccountant() && (
            <>
              <button
                onClick={() => downloadIngredientsTemplate().catch(console.error)}
                className="text-sm px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                title="تحميل قالب Excel لاستيراد مواد خام جديدة"
              >
                ⬇ قالب استيراد
              </button>
              <button
                onClick={() => downloadPriceTemplate(ingredients).catch(console.error)}
                disabled={ingredients.length === 0}
                className="text-sm px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors"
                title="تحميل قالب Excel لتحديث الأسعار"
              >
                ⬇ قالب أسعار
              </button>
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors inline-block">
                  ⬆ استيراد أسعار
                </span>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden" />
              </label>
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await exportIngredients(brand, supabase)
                }}
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
              >
                ⬇ تصدير بيانات
              </button>
              <label className="cursor-pointer">
                <span className={`text-sm px-3 py-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors inline-block ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing ? 'جارٍ...' : '⬆ استيراد بيانات'}
                </span>
                <input
                  ref={dataFileRef}
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
                      const res = await importIngredients(file, brand, supabase)
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
      {importMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg border flex items-center justify-between ${importMsg.startsWith('خطأ') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} className="mr-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <IngredientTable
        ingredients={filtered}
        conversions={convMap}
        canEdit={canEdit('ingredients')}
        canSeePrices={canSeePrices()}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {showForm && (
        <IngredientForm
          brand={brand}
          ingredient={editIngredient}
          onClose={handleClose}
          onSaved={() => { handleClose(); router.refresh() }}
        />
      )}

      {priceChanges && (
        <PriceImpactModal
          changes={priceChanges}
          onClose={() => setPriceChanges(null)}
          onApplied={() => { setPriceChanges(null); router.refresh() }}
        />
      )}
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}
