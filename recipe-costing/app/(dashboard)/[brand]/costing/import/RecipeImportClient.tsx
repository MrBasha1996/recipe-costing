'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import {
  downloadRecipeImportTemplate,
  downloadBatchRecipeImportTemplate,
  parseRecipeImportFile,
  analyzeImportData,
  executeImport,
  type ImportAnalysis,
  type ImportMode,
  type ImportProduct,
  type ImportVersion,
  type ImportVersionMode,
  type ParseError,
  type ParseResult,
} from '@/lib/recipeImport'
import { qc, cacheKey } from '@/lib/queryCache'
import type { BrandId } from '@/types'

// ── Types ─────────────────────────────────────────────────────────

type Step = 'upload' | 'create_new' | 'review' | 'result'
type NewItemType = 'ingredient' | 'batch'

interface NewItemDraft {
  originalSku: string
  sku: string
  name: string
  type: NewItemType
  category: string
  unit: string
  cost: number
}

// ── Helpers ───────────────────────────────────────────────────────

function statusBadge(status: ImportVersion['status']) {
  switch (status) {
    case 'new_product': return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">منتج جديد</span>
    )
    case 'new_recipe': return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">وصفة جديدة</span>
    )
    case 'new_version': return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">إصدار جديد</span>
    )
    case 'duplicate': return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">مكررة</span>
    )
    default: return null
  }
}

function fcColor(pct: number) {
  if (pct <= 35) return 'text-green-600'
  if (pct <= 45) return 'text-amber-600'
  return 'text-red-600'
}

const INGREDIENT_CATEGORIES = ['لحوم', 'دواجن', 'خضار', 'فواكه', 'بقوليات', 'توابل وبهارات', 'منتجات ألبان', 'زيوت ودهون', 'حبوب ودقيق', 'مشروبات', 'تغليف', 'أخرى']

// ── NewItemCard ───────────────────────────────────────────────────

function NewItemCard({
  draft,
  onChange,
}: {
  draft: NewItemDraft
  onChange: (updates: Partial<NewItemDraft>) => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400 flex-shrink-0">الكود:</label>
            <input
              type="text"
              value={draft.sku}
              onChange={e => onChange({ sku: e.target.value.trim() })}
              className="font-mono text-xs border border-gray-300 rounded px-2 py-1 w-32 focus:outline-none focus:border-blue-500 bg-white"
              placeholder="SKU"
            />
          </div>
          {draft.sku !== draft.originalSku && (
            <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
              تم تعديل الكود
            </span>
          )}
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">غير موجود</span>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs flex-shrink-0">
          <button
            type="button"
            onClick={() => onChange({ type: 'ingredient' })}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              draft.type === 'ingredient' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            مادة خام
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: 'batch' })}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              draft.type === 'batch' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            باتش
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">الاسم <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={draft.name}
            onChange={e => onChange({ name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="اسم المادة"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">الوحدة <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={draft.unit}
            onChange={e => onChange({ unit: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="كيلو / لتر / جرام..."
          />
        </div>

        {draft.type === 'ingredient' ? (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">التكلفة / وحدة (ر.س)</label>
              <input
                type="number"
                min={0}
                step="0.0001"
                value={draft.cost}
                onChange={e => onChange({ cost: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                placeholder="0.00"
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-xs text-gray-500 mb-1">الفئة</label>
              <div className="flex flex-wrap gap-1.5">
                {INGREDIENT_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onChange({ category: cat })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      draft.category === cat
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-2 md:col-span-2 flex items-end">
            <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 w-full">
              💡 الباتش سيُنشأ كمنتج وسيط — تكلفته تُحسب من وصفته عند إضافتها لاحقاً
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── VersionCard ───────────────────────────────────────────────────

function VersionCard({
  version,
  checked,
  disabled,
  mode,
  onChange,
  onModeChange,
}: {
  version: ImportVersion
  checked: boolean
  disabled: boolean
  mode: ImportVersionMode
  onChange: (checked: boolean) => void
  onModeChange: (mode: ImportVersionMode) => void
}) {
  const [open, setOpen] = useState(false)
  // Only offer overwrite when the active recipe is NOT yet approved
  const canChooseMode = version.status === 'new_version' && version.activeRecipeId != null && version.activeRecipeApproved === false

  return (
    <div className={`border rounded-lg transition-colors ${
      disabled ? 'border-gray-200 bg-gray-50 opacity-60' :
      checked   ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{version.version_name}</span>
            {statusBadge(version.status)}
            {version.unknownSkus.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                ⚠ {version.unknownSkus.length} مكوّن غير معروف
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{version.statusMessage}</div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {canChooseMode && checked && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => onModeChange('new_version')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  mode === 'new_version' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >إصدار جديد</button>
              <button
                onClick={() => onModeChange('overwrite')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  mode === 'overwrite' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >استبدال الحالي</button>
            </div>
          )}
          <div className="flex items-center gap-3 text-left">
            <div className="text-center">
              <div className="text-xs text-gray-400">مكونات</div>
              <div className="text-sm font-semibold text-gray-700">{version.ingredients.length}</div>
            </div>
            {version.total_cost > 0 && (
              <div className="text-center">
                <div className="text-xs text-gray-400">التكلفة</div>
                <div className="text-sm font-semibold text-gray-700">{version.total_cost.toFixed(2)} ر.س</div>
              </div>
            )}
            {version.food_cost_pct > 0 && (
              <div className="text-center">
                <div className="text-xs text-gray-400">FC%</div>
                <div className={`text-sm font-bold font-mono ${fcColor(version.food_cost_pct)}`}>
                  {version.food_cost_pct.toFixed(1)}%
                </div>
              </div>
            )}
            <button
              onClick={() => setOpen(v => !v)}
              className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100"
            >
              {open ? 'إخفاء ▲' : 'تفاصيل ▼'}
            </button>
          </div>
        </div>
      </div>

      {canChooseMode && checked && mode === 'overwrite' && (
        <div className="mx-4 mb-3 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
          ⚠ سيتم <strong>تعديل مكونات الإصدار النشط الحالي (غير المعتمد) مباشرةً</strong> — لا يمكن التراجع.
          {version.activeVersionNumber && <span className="mr-1">(الإصدار: {version.activeVersionNumber})</span>}
        </div>
      )}

      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <table suppressHydrationWarning className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-right pb-1.5 font-medium">SKU</th>
                <th className="text-right pb-1.5 font-medium">الاسم</th>
                <th className="text-right pb-1.5 font-medium">الكمية</th>
                <th className="text-right pb-1.5 font-medium">الوحدة</th>
                <th className="text-right pb-1.5 font-medium">Yield%</th>
                <th className="text-right pb-1.5 font-medium">القسم</th>
                <th className="text-right pb-1.5 font-medium">الخدمة</th>
              </tr>
            </thead>
            <tbody>
              {version.ingredients.map((ing, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-1 font-mono text-gray-500">{ing.ing_sku}</td>
                  <td className="py-1 text-gray-700">{ing.ing_name}</td>
                  <td className="py-1 text-gray-700">{ing.qty}</td>
                  <td className="py-1 text-gray-600">{ing.unit}</td>
                  <td className="py-1 text-gray-600">{ing.yield_pct}%</td>
                  <td className="py-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      ing.section === 'food' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {ing.section === 'food' ? 'غذاء' : 'تغليف'}
                    </span>
                  </td>
                  <td className="py-1 text-gray-500 font-mono text-[10px]">{ing.service_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {version.unknownSkus.length > 0 && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
              ⚠ المكونات التالية لم تُنشأ بعد — ستُستورد بتكلفة 0:
              <span className="font-mono mr-1">{version.unknownSkus.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ProductSection ────────────────────────────────────────────────

function ProductSection({
  product, selectedKeys, modes,
  onToggleVersion, onToggleAll, onModeChange,
}: {
  product: ImportProduct
  selectedKeys: Set<string>
  modes: Record<string, ImportVersionMode>
  onToggleVersion: (key: string, checked: boolean) => void
  onToggleAll: (sku: string, checked: boolean) => void
  onModeChange: (key: string, mode: ImportVersionMode) => void
}) {
  const selectableVersions = product.versions.filter(v => v.status !== 'duplicate')
  const selectedCount = selectableVersions.filter(v => selectedKeys.has(v.key)).length
  const allSelected = selectableVersions.length > 0 && selectedCount === selectableVersions.length
  const someSelected = selectedCount > 0 && !allSelected

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 border-b border-gray-200">
        {selectableVersions.length > 0 && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={e => onToggleAll(product.sku, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{product.name}</span>
            <span className="font-mono text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded">{product.sku}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              product.category === 'Batch' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {product.category === 'Batch' ? 'Batch ⚙' : 'Meal 🍽'}
            </span>
            {product.isNew && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">منتج جديد</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {product.versions.length} {product.versions.length === 1 ? 'وصفة' : 'وصفات'} •
            سعر البيع: {product.sell_price.toFixed(2)} ر.س
            {product.app_price ? ` • التطبيق: ${product.app_price.toFixed(2)} ر.س` : ''}
          </div>
        </div>
        <div className="text-xs text-gray-500 flex-shrink-0">{selectedCount}/{selectableVersions.length} محدد</div>
      </div>
      <div className="p-3 space-y-2">
        {product.versions.map(version => (
          <VersionCard
            key={version.key}
            version={version}
            checked={version.status !== 'duplicate' && selectedKeys.has(version.key)}
            disabled={version.status === 'duplicate'}
            mode={modes[version.key] ?? 'new_version'}
            onChange={checked => onToggleVersion(version.key, checked)}
            onModeChange={m => onModeChange(version.key, m)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export default function RecipeImportClient({ brand, mode = 'meal' }: { brand: BrandId; mode?: ImportMode }) {
  const { profile } = useUserStore()

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [creatingItems, setCreatingItems] = useState(false)
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [parsedData, setParsedData] = useState<ParseResult | null>(null)
  const [newItemDrafts, setNewItemDrafts] = useState<NewItemDraft[]>([])
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [modes, setModes] = useState<Record<string, ImportVersionMode>>({})
  const [importResult, setImportResult] = useState<{ succeeded: string[]; failed: { key: string; error: string }[] } | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function buildDrafts(result: ImportAnalysis, _parsed: ParseResult): NewItemDraft[] {
    const seenSkus = new Set<string>()
    const drafts: NewItemDraft[] = []
    const productSkusInFile = new Set(result.products.map(p => p.sku))
    for (const p of result.products) {
      for (const v of p.versions) {
        for (const sku of v.unknownSkus) {
          if (seenSkus.has(sku)) continue
          seenSkus.add(sku)
          const ing = v.ingredients.find(i => i.ing_sku === sku)
          drafts.push({
            originalSku: sku,
            sku,
            name: ing?.ing_name ?? sku,
            type: productSkusInFile.has(sku) ? 'batch' : 'ingredient',
            category: '',
            unit: ing?.unit ?? '',
            cost: 0,
          })
        }
      }
    }
    return drafts
  }

  function autoSelectVersions(result: ImportAnalysis) {
    const keys = new Set<string>()
    for (const p of result.products)
      for (const v of p.versions)
        if (v.status !== 'duplicate') keys.add(v.key)
    setSelectedKeys(keys)
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setGlobalError('يُقبل ملفات Excel فقط (.xlsx أو .xls)')
      return
    }
    setGlobalError(null)
    setParseErrors([])
    setParsing(true)
    try {
      const parsed = await parseRecipeImportFile(file, mode)
      setParseErrors(parsed.errors)
      if (parsed.rows.length === 0) {
        setGlobalError('لم يتم العثور على بيانات صالحة في الملف')
        return
      }
      setParsedData(parsed)
      setAnalyzing(true)
      setParsing(false)

      const supabase = createClient()
      const result = await analyzeImportData(parsed, brand, supabase)
      setAnalysis(result)
      autoSelectVersions(result)

      const drafts = buildDrafts(result, parsed)
      if (drafts.length > 0) {
        setNewItemDrafts(drafts)
        setStep('create_new')
      } else {
        setStep('review')
      }
    } catch (e: any) {
      setGlobalError(e.message)
    } finally {
      setParsing(false)
      setAnalyzing(false)
    }
  }, [brand])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleCreateItems() {
    const invalid = newItemDrafts.find(d => !d.name.trim() || !d.unit.trim() || !d.sku.trim())
    if (invalid) {
      setCreateError(`يرجى تعبئة الكود والاسم والوحدة لجميع المواد (${invalid.originalSku})`)
      return
    }
    const draftSkus = newItemDrafts.map(d => d.sku.trim())
    const hasDuplicates = draftSkus.length !== new Set(draftSkus).size
    if (hasDuplicates) {
      setCreateError('يوجد تكرار في أكواد المواد — تأكد من أن كل كود فريد')
      return
    }

    setCreateError(null)
    setCreatingItems(true)
    try {
      const supabase = createClient()

      for (const draft of newItemDrafts) {
        const finalSku = draft.sku.trim()

        if (draft.type === 'ingredient') {
          const { data: created, error } = await (supabase.from('ingredients') as any)
            .insert({
              sku: finalSku,
              brand_id: brand,
              name: draft.name.trim(),
              category: draft.category || 'أخرى',
              unit: draft.unit.trim(),
              cost: draft.cost,
              is_base: false,
            })
            .select('sku')

          if (error) {
            if (error.code === '23505') continue
            throw new Error(`فشل إنشاء المادة "${draft.name}" (${finalSku}): ${error.message}`)
          }
          if (!created || created.length === 0) {
            throw new Error(`لم تُنشأ المادة "${draft.name}" (${finalSku}) — تحقق من صلاحيات المستخدم`)
          }

        } else {
          const { data: created, error } = await (supabase.from('batches') as any)
            .insert({
              sku: finalSku,
              brand_id: brand,
              name: draft.name.trim(),
              unit: draft.unit.trim() || 'كيلو',
            })
            .select('sku')

          if (error) {
            if (error.code === '23505') continue
            throw new Error(`فشل إنشاء الباتش "${draft.name}" (${finalSku}): ${error.message}`)
          }
          if (!created || created.length === 0) {
            throw new Error(`لم يُنشأ الباتش "${draft.name}" (${finalSku}) — تحقق من صلاحيات المستخدم`)
          }
        }
      }

      const skuRemap: Record<string, string> = {}
      for (const d of newItemDrafts) {
        if (d.sku.trim() !== d.originalSku) skuRemap[d.originalSku] = d.sku.trim()
      }

      let dataForAnalysis = parsedData!
      if (Object.keys(skuRemap).length > 0 && parsedData) {
        dataForAnalysis = {
          ...parsedData,
          rows: parsedData.rows.map(r => {
            const newSku = skuRemap[r.ing_sku]
            if (!newSku) return r
            const draft = newItemDrafts.find(d => d.originalSku === r.ing_sku)
            return { ...r, ing_sku: newSku, ing_name: draft?.name ?? r.ing_name }
          }),
        }
        setParsedData(dataForAnalysis)
      }

      setAnalyzing(true)
      const supabase2 = createClient()
      const result = await analyzeImportData(dataForAnalysis, brand, supabase2)
      setAnalysis(result)
      autoSelectVersions(result)
      setStep('review')
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setCreatingItems(false)
      setAnalyzing(false)
    }
  }

  function skipCreateItems() {
    setStep('review')
  }

  function toggleVersion(key: string, checked: boolean) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function toggleAll(sku: string, checked: boolean) {
    const product = analysis?.products.find(p => p.sku === sku)
    if (!product) return
    setSelectedKeys(prev => {
      const next = new Set(prev)
      for (const v of product.versions) {
        if (v.status !== 'duplicate') {
          if (checked) next.add(v.key)
          else next.delete(v.key)
        }
      }
      return next
    })
  }

  function selectAllImportable() {
    const keys = new Set<string>()
    analysis?.products.forEach(p => p.versions.forEach(v => {
      if (v.status !== 'duplicate') keys.add(v.key)
    }))
    setSelectedKeys(keys)
  }

  function changeMode(key: string, mode: ImportVersionMode) {
    setModes(prev => ({ ...prev, [key]: mode }))
  }

  async function handleImport() {
    if (!analysis || selectedKeys.size === 0) return
    setImporting(true)
    try {
      const supabase = createClient()
      const result = await executeImport(selectedKeys, modes, analysis, brand, profile?.id ?? null, supabase)
      setImportResult(result)
      // Bust cache so sidebar loads fresh data after import
      qc.bust(cacheKey.recipes(brand))
      qc.bust(cacheKey.batchRecipes(brand))
      qc.bust(`batches:${brand}`)
      qc.bust(cacheKey.products(brand))
      setStep('result')
    } catch (e: any) {
      setGlobalError(e.message)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep('upload')
    setParsedData(null)
    setAnalysis(null)
    setNewItemDrafts([])
    setSelectedKeys(new Set())
    setModes({})
    setImportResult(null)
    setGlobalError(null)
    setCreateError(null)
    setParseErrors([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const hasCreateStep = newItemDrafts.length > 0 || step === 'create_new'
  const allSteps: { key: Step; label: string }[] = hasCreateStep
    ? [
        { key: 'upload', label: 'رفع الملف' },
        { key: 'create_new', label: 'مواد جديدة' },
        { key: 'review', label: 'المراجعة' },
        { key: 'result', label: 'النتيجة' },
      ]
    : [
        { key: 'upload', label: 'رفع الملف' },
        { key: 'review', label: 'المراجعة' },
        { key: 'result', label: 'النتيجة' },
      ]

  const stepOrder = allSteps.map(s => s.key)
  const currentIdx = stepOrder.indexOf(step)

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {mode === 'batch' ? 'استيراد وصفات الباتشات' : 'استيراد وصفات المنتجات'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {mode === 'batch'
              ? 'استيراد وصفات لعدة باتشات دفعة واحدة من ملف Excel'
              : 'استيراد وصفات لعدة منتجات دفعة واحدة من ملف Excel'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-mono">{brand}</span>
          <button
            onClick={() => mode === 'batch' ? downloadBatchRecipeImportTemplate() : downloadRecipeImportTemplate()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            ⬇ تحميل القالب
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {allSteps.map((s, i) => {
          const done = i < currentIdx
          const active = step === s.key
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${done ? 'bg-blue-400' : 'bg-gray-200'}`} />}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' :
                done   ? 'bg-blue-100 text-blue-700' :
                         'bg-gray-100 text-gray-500'
              }`}>
                {done ? '✓' : i + 1} {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {globalError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{globalError}</div>
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {parsing || analyzing ? (
              <div className="space-y-2">
                <div className="text-3xl animate-spin inline-block">⏳</div>
                <div className="text-sm text-gray-500">
                  {parsing ? 'جارٍ قراءة الملف...' : 'جارٍ تحليل البيانات مقارنةً بقاعدة البيانات...'}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-4xl">📂</div>
                <div className="text-base font-medium text-gray-700">اسحب ملف Excel هنا أو انقر للاختيار</div>
                <div className="text-sm text-gray-400">.xlsx أو .xls</div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
            <div className="font-semibold text-gray-800 mb-2">تعليمات الملف:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="font-medium text-gray-700 text-xs mb-1">
                  {mode === 'batch' ? 'ورقة 1 — الباتشات:' : 'ورقة 1 — المنتجات:'}
                </div>
                <div className="text-xs space-y-0.5 text-gray-500">
                  {mode === 'batch' ? (
                    <>
                      <div>• SKU الباتش، اسم الباتش</div>
                      <div>• الكمية المنتجة (وحدة)</div>
                    </>
                  ) : (
                    <>
                      <div>• SKU المنتج، اسم المنتج، النوع = Meal</div>
                      <div>• عدد الحصص، سعر البيع، سعر التطبيق</div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="font-medium text-gray-700 text-xs mb-1">ورقة 2 — مكونات الوصفة:</div>
                <div className="text-xs space-y-0.5 text-gray-500">
                  <div>• SKU {mode === 'batch' ? 'الباتش' : 'المنتج'}، اسم الإصدار، SKU المكوّن</div>
                  <div>• الكمية، الوحدة، Yield %، القسم، نوع الخدمة</div>
                </div>
              </div>
            </div>
            <div className="pt-1 text-xs text-gray-400 border-t border-gray-200">
              💡 نفس "اسم الإصدار" + نفس "SKU {mode === 'batch' ? 'الباتش' : 'المنتج'}" = وصفة واحدة.
              {mode === 'batch' && ' الملف يقبل فقط صفوف من نوع Batch.'}
              {mode === 'meal' && ' الملف يقبل فقط صفوف من نوع Meal.'}
            </div>
          </div>
        </div>
      )}

      {step === 'create_new' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← رفع ملف آخر
            </button>
            <div className="flex gap-2">
              <button
                onClick={skipCreateItems}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                تخطي — استيراد بتكلفة 0
              </button>
              <button
                onClick={handleCreateItems}
                disabled={creatingItems || analyzing}
                className="px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {creatingItems || analyzing ? (
                  <><span className="animate-spin inline-block">⏳</span> جارٍ الإنشاء...</>
                ) : (
                  <>إنشاء {newItemDrafts.length} مادة والمتابعة ←</>
                )}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-amber-800 mb-1">
              ⚠ تم العثور على {newItemDrafts.length} {newItemDrafts.length === 1 ? 'مادة غير موجودة' : 'مواد غير موجودة'} في قاعدة البيانات
            </div>
            <div className="text-xs text-amber-700">
              حدد نوع كل مادة (مادة خام أو باتش) وأكمل البيانات المطلوبة قبل الاستيراد.
              يمكنك أيضاً تخطي هذه الخطوة وستُستورد الوصفات بتكلفة 0 لهذه المواد.
            </div>
          </div>

          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
          )}

          <div className="space-y-3">
            {newItemDrafts.map((draft, idx) => (
              <NewItemCard
                key={draft.sku}
                draft={draft}
                onChange={updates => {
                  setNewItemDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...updates } : d))
                }}
              />
            ))}
          </div>
        </div>
      )}

      {step === 'review' && analysis && (
        <div className="space-y-4">

          {parseErrors.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
              <div className="font-semibold">⚠ تحذيرات أثناء القراءة ({parseErrors.length}):</div>
              {parseErrors.map((e, i) => <div key={i} className="text-xs">{e.message}</div>)}
            </div>
          )}

          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 sticky top-16 z-10">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← رفع ملف آخر
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                محدد: <span className="font-bold text-blue-700">{selectedKeys.size}</span> وصفة
              </span>
              <button
                onClick={handleImport}
                disabled={selectedKeys.size === 0 || importing}
                className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {importing ? (
                  <><span className="animate-spin">⏳</span> جارٍ الاستيراد...</>
                ) : (
                  <>استيراد {selectedKeys.size} وصفة ✓</>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-800">{analysis.summary.totalProducts}</div>
              <div className="text-xs text-gray-500 mt-0.5">منتج</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-700">{analysis.summary.newProducts}</div>
              <div className="text-xs text-gray-500 mt-0.5">منتج جديد</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">{analysis.summary.toImport}</div>
              <div className="text-xs text-gray-500 mt-0.5">وصفة للاستيراد</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-400">{analysis.summary.duplicates}</div>
              <div className="text-xs text-gray-500 mt-0.5">مكررة</div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={selectAllImportable} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">تحديد الكل</button>
            <button onClick={() => setSelectedKeys(new Set())} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">إلغاء الكل</button>
          </div>

          <div className="space-y-4">
            {analysis.products.map(product => (
              <ProductSection
                key={product.sku}
                product={product}
                selectedKeys={selectedKeys}
                modes={modes}
                onToggleVersion={toggleVersion}
                onToggleAll={toggleAll}
                onModeChange={changeMode}
              />
            ))}
          </div>

          <div className="h-4" />
        </div>
      )}

      {step === 'result' && importResult && (
        <div className="space-y-4">
          <div className={`p-5 rounded-xl border text-center ${
            importResult.failed.length === 0 ? 'bg-green-50 border-green-200' :
            importResult.succeeded.length === 0 ? 'bg-red-50 border-red-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <div className="text-3xl mb-2">
              {importResult.failed.length === 0 ? '✅' : importResult.succeeded.length === 0 ? '❌' : '⚠'}
            </div>
            <div className="text-lg font-bold text-gray-800">
              {importResult.failed.length === 0 ? 'تم الاستيراد بنجاح' :
               importResult.succeeded.length === 0 ? 'فشل الاستيراد' :
               'اكتمل الاستيراد جزئياً'}
            </div>
            <div className="text-sm text-gray-600 mt-1 flex items-center justify-center gap-2 flex-wrap">
              {importResult.succeeded.length > 0 && (
                <span className="text-green-700 font-semibold">{importResult.succeeded.length} وصفة تم استيرادها</span>
              )}
              {importResult.failed.length > 0 && importResult.succeeded.length > 0 && <span>•</span>}
              {importResult.failed.length > 0 && (
                <span className="text-red-700 font-semibold">{importResult.failed.length} وصفة فشلت</span>
              )}
            </div>
          </div>

          {importResult.succeeded.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-green-700 mb-2">الوصفات المستوردة:</div>
              <div className="space-y-1">
                {importResult.succeeded.map(key => {
                  const [sku, vName] = key.split('::')
                  const prod = analysis?.products.find(p => p.sku === sku)
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm p-2.5 bg-green-50 border border-green-100 rounded-lg">
                      <span className="text-green-600">✓</span>
                      <span className="font-medium text-gray-700">{prod?.name ?? sku}</span>
                      <span className="text-gray-400">—</span>
                      <span className="text-gray-600">{vName}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {importResult.failed.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-700 mb-2">الوصفات التي فشلت:</div>
              <div className="space-y-1">
                {importResult.failed.map(({ key, error }) => {
                  const [sku, vName] = key.split('::')
                  const prod = analysis?.products.find(p => p.sku === sku)
                  return (
                    <div key={key} className="flex items-start gap-2 text-sm p-2.5 bg-red-50 border border-red-100 rounded-lg">
                      <span className="text-red-500 flex-shrink-0">✗</span>
                      <div>
                        <span className="font-medium text-gray-700">{prod?.name ?? sku}</span>
                        <span className="text-gray-400 mx-1">—</span>
                        <span className="text-gray-600">{vName}</span>
                        <div className="text-xs text-red-600 mt-0.5">{error}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-200">
            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              استيراد ملف آخر
            </button>
            <a href={`/${brand}/costing`} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              الذهاب إلى الوصفات ←
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
