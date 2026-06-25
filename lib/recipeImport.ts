// Recipe bulk import — template, parser, analyzer, executor
let _xlsx: typeof import('xlsx') | null = null
async function xlsx() {
  if (!_xlsx) _xlsx = await import('xlsx')
  return _xlsx
}

import type { BrandId, RecipeRowDraft } from '@/types'
import { calcServiceCost } from '@/lib/calculations'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────

export type ImportStatus =
  | 'new_product'   // product doesn't exist in DB
  | 'new_recipe'    // product exists, no recipe yet
  | 'new_version'   // product has recipe(s), ingredients differ
  | 'duplicate'     // identical ingredients already in an existing version

export type ImportVersionMode = 'new_version' | 'overwrite'

export interface ImportIngredientRow {
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  yield_pct: number
  section: 'food' | 'packaging'
  service_type: 'both' | 'dine_in' | 'dine_out'
}

export interface ImportVersion {
  key: string               // `${product_sku}::${version_name}` — unique selection key
  version_name: string
  yield_portions: number
  ingredients: ImportIngredientRow[]
  // filled by analyzer:
  status: ImportStatus
  statusMessage: string
  total_cost: number
  food_cost_pct: number
  margin: number
  unknownSkus: string[]     // ing_skus not found anywhere in DB (truly unknown)
  activeRecipeId: string | null    // ID of current active recipe (used for overwrite mode)
  activeVersionNumber: number | null
  activeRecipeApproved: boolean | null  // null = no active recipe
}

export interface ImportProduct {
  sku: string
  name: string
  category: 'Meal' | 'Batch'
  sell_price: number
  app_price: number | null
  isNew: boolean
  versions: ImportVersion[]
}

export interface ImportAnalysis {
  products: ImportProduct[]
  summary: {
    totalProducts: number
    newProducts: number
    totalVersions: number
    toImport: number
    duplicates: number
    errors: number
  }
}

// ── Template download ─────────────────────────────────────────────

// ── Meal recipe import template ───────────────────────────────────
export async function downloadRecipeImportTemplate(): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()

  const wsProds = X.utils.json_to_sheet([
    {
      'SKU المنتج': 'p-001',
      'اسم المنتج': 'فول جرة كبير',
      'النوع (Meal/Batch)': 'Meal',
      'عدد الحصص': 1,
      'سعر البيع (ريال شامل VAT)': 17.25,
      'سعر التطبيق (ريال شامل VAT)': 20.00,
    },
  ])
  wsProds['!cols'] = [
    { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 26 }, { wch: 26 },
  ]
  X.utils.book_append_sheet(wb, wsProds, 'المنتجات')

  const wsIng = X.utils.json_to_sheet([
    {
      'SKU المنتج': 'p-001',
      'اسم الإصدار': 'الوصفة الأساسية',
      'SKU المكوّن': 'i-001',
      'اسم المكوّن': 'فول مدمس',
      'الكمية': 200,
      'الوحدة': 'جرام',
      'Yield %': 100,
      'القسم (food/packaging)': 'food',
      'نوع الخدمة (both/dine_in/dine_out)': 'both',
    },
    {
      'SKU المنتج': 'p-001',
      'اسم الإصدار': 'الوصفة الأساسية',
      'SKU المكوّن': 'sk-0166',
      'اسم المكوّن': 'صوص الفول (batch)',
      'الكمية': 50,
      'الوحدة': 'جرام',
      'Yield %': 100,
      'القسم (food/packaging)': 'food',
      'نوع الخدمة (both/dine_in/dine_out)': 'both',
    },
  ])
  wsIng['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 28 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 30 },
  ]
  X.utils.book_append_sheet(wb, wsIng, 'مكونات الوصفة')

  X.writeFile(wb, 'قالب_استيراد_وصفات_المنتجات.xlsx')
}

// ── Batch recipe import template ──────────────────────────────────
export async function downloadBatchRecipeImportTemplate(): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()

  const wsProds = X.utils.json_to_sheet([
    {
      'SKU الباتش': 'sk-001',
      'اسم الباتش': 'صوص الفول',
      'النوع (Meal/Batch)': 'Batch',
      'الكمية المنتجة (وحدة)': 1,
    },
  ])
  wsProds['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 22 }]
  X.utils.book_append_sheet(wb, wsProds, 'الباتشات')

  const wsIng = X.utils.json_to_sheet([
    {
      'SKU المنتج': 'sk-001',
      'اسم الإصدار': 'الوصفة الأساسية',
      'SKU المكوّن': 'i-010',
      'اسم المكوّن': 'طحينة',
      'الكمية': 500,
      'الوحدة': 'جرام',
      'Yield %': 100,
      'القسم (food/packaging)': 'food',
      'نوع الخدمة (both/dine_in/dine_out)': 'both',
    },
    {
      'SKU المنتج': 'sk-001',
      'اسم الإصدار': 'الوصفة الأساسية',
      'SKU المكوّن': 'i-011',
      'اسم المكوّن': 'ليمون',
      'الكمية': 100,
      'الوحدة': 'جرام',
      'Yield %': 85,
      'القسم (food/packaging)': 'food',
      'نوع الخدمة (both/dine_in/dine_out)': 'both',
    },
  ])
  wsIng['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 28 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 30 },
  ]
  X.utils.book_append_sheet(wb, wsIng, 'مكونات الوصفة')

  X.writeFile(wb, 'قالب_استيراد_وصفات_الباتشات.xlsx')
}

// ── Parser ────────────────────────────────────────────────────────

interface ParsedRow {
  product_sku: string
  product_name: string
  product_category: 'Meal' | 'Batch'
  yield_portions: number
  sell_price: number
  app_price: number | null
  version_name: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  yield_pct: number
  section: 'food' | 'packaging'
  service_type: 'both' | 'dine_in' | 'dine_out'
}

function normalizeSection(v: string): 'food' | 'packaging' {
  return String(v ?? '').trim().toLowerCase() === 'packaging' ? 'packaging' : 'food'
}

function normalizeServiceType(v: string): 'both' | 'dine_in' | 'dine_out' {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'dine_in') return 'dine_in'
  if (s === 'dine_out') return 'dine_out'
  return 'both'
}

export interface ParseError {
  row: number
  message: string
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: ParseError[]
}

export type ImportMode = 'meal' | 'batch'

export function parseRecipeImportFile(file: File, mode: ImportMode = 'meal'): Promise<ParseResult> {
  const expectedCategory: 'Meal' | 'Batch' = mode === 'batch' ? 'Batch' : 'Meal'

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })

        const prodSheetName = (mode === 'batch'
          ? wb.SheetNames.find(n => (n.includes('باتش') || n.includes('batch')) && !n.includes('مكون'))
            ?? wb.SheetNames.find(n => n.includes('باتش') || n.includes('batch'))
          : wb.SheetNames.find(n => (n.includes('منتج') || n.includes('product')) && !n.includes('مكون'))
            ?? wb.SheetNames.find(n => n.includes('منتج') || n.includes('product'))
        ) ?? wb.SheetNames[0]

        const ingSheetName = (mode === 'batch'
          ? wb.SheetNames.find(n => (n.includes('مكون') || n.includes('ingredient')) && (n.includes('باتش') || n.includes('batch')))
            ?? wb.SheetNames.find(n => n.includes('مكون') || n.includes('ingredient'))
          : wb.SheetNames.find(n => (n.includes('مكون') || n.includes('ingredient')) && (n.includes('منتج') || n.includes('meal')))
            ?? wb.SheetNames.find(n => n.includes('مكون') || n.includes('ingredient'))
        ) ?? wb.SheetNames[1]

        if (!prodSheetName || !ingSheetName) {
          throw new Error('لم يتم العثور على الورقتين المطلوبتين في الملف')
        }

        const prodRows: any[] = X.utils.sheet_to_json(wb.Sheets[prodSheetName])
        const ingRows:  any[] = X.utils.sheet_to_json(wb.Sheets[ingSheetName])

        const productMap = new Map<string, {
          name: string; category: 'Meal' | 'Batch'; yield_portions: number
          sell_price: number; app_price: number | null
        }>()

        for (const r of prodRows) {
          // قالب الباتش يستخدم "SKU الباتش"، قالب المنتجات يستخدم "SKU المنتج"
          const sku = String(r['SKU المنتج'] ?? r['SKU الباتش'] ?? '').trim()
          if (!sku) continue
          const cat = String(r['النوع (Meal/Batch)'] ?? '').trim()
          const resolvedCat: 'Meal' | 'Batch' = cat === 'Batch' ? 'Batch' : 'Meal'
          // في وضع الباتش: إذا لم يُحدَّد النوع، نعامله كـ Batch تلقائياً
          const finalCat: 'Meal' | 'Batch' = cat === '' ? expectedCategory : resolvedCat
          productMap.set(sku, {
            name: String(r['اسم المنتج'] ?? r['اسم الباتش'] ?? '').trim(),
            category: finalCat,
            yield_portions: parseFloat(r['عدد الحصص'] ?? r['الكمية المنتجة (وحدة)']) || 1,
            sell_price: parseFloat(r['سعر البيع (ريال شامل VAT)']) || 0,
            app_price: r['سعر التطبيق (ريال شامل VAT)'] != null && r['سعر التطبيق (ريال شامل VAT)'] !== ''
              ? parseFloat(r['سعر التطبيق (ريال شامل VAT)']) : null,
          })
        }

        const errors: ParseError[] = []
        const rows: ParsedRow[] = []

        ingRows.forEach((r: any, idx: number) => {
          const rowNum = idx + 2
          const product_sku = String(r['SKU المنتج'] ?? '').trim()
          const ing_sku = String(r['SKU المكوّن'] ?? '').trim()
          const ing_name = String(r['اسم المكوّن'] ?? '').trim()

          if (!product_sku) { errors.push({ row: rowNum, message: `سطر ${rowNum}: SKU مطلوب` }); return }
          if (!ing_sku || !ing_name) { errors.push({ row: rowNum, message: `سطر ${rowNum}: SKU المكوّن واسمه مطلوبان` }); return }

          const prod = productMap.get(product_sku)
          if (!prod) { errors.push({ row: rowNum, message: `سطر ${rowNum}: SKU "${product_sku}" غير موجود في الورقة الأولى` }); return }

          // فلتر صارم: تجاهل الصفوف التي لا تتطابق مع الوضع الحالي
          if (prod.category !== expectedCategory) {
            errors.push({ row: rowNum, message: `سطر ${rowNum}: "${product_sku}" من نوع ${prod.category} — استخدم صفحة استيراد ${prod.category === 'Meal' ? 'المنتجات' : 'الباتشات'}` })
            return
          }

          rows.push({
            product_sku,
            product_name: prod.name,
            product_category: prod.category,
            yield_portions: prod.yield_portions,
            sell_price: prod.sell_price,
            app_price: prod.app_price,
            version_name: String(r['اسم الإصدار'] ?? '').trim() || 'الإصدار الرئيسي',
            ing_sku,
            ing_name,
            qty: parseFloat(r['الكمية']) || 0,
            unit: String(r['الوحدة'] ?? '').trim(),
            yield_pct: parseFloat(r['Yield %']) || 100,
            section: normalizeSection(r['القسم (food/packaging)']),
            service_type: normalizeServiceType(r['نوع الخدمة (both/dine_in/dine_out)']),
          })
        })

        resolve({ rows, errors })
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Helpers ───────────────────────────────────────────────────────

function ingredientFingerprint(ings: ImportIngredientRow[]): string {
  return [...ings]
    .sort((a, b) => a.ing_sku.localeCompare(b.ing_sku))
    .map(i => `${i.ing_sku}:${i.qty}:${i.unit}:${i.yield_pct}:${i.section}:${i.service_type}`)
    .join('|')
}

function existingFingerprint(ings: any[]): string {
  return [...ings]
    .sort((a, b) => String(a.ing_sku).localeCompare(String(b.ing_sku)))
    .map(i => `${i.ing_sku}:${i.qty}:${i.unit}:${i.yield_pct}:${i.section ?? 'food'}:${i.service_type ?? 'both'}`)
    .join('|')
}

/**
 * Build a cost map and semi-product SKU set for a list of ingredient SKUs.
 * - Raw ingredients: cost from `ingredients` table.
 * - Semi-products (batches): cost from active recipe (total_cost / yield_portions).
 *   If the batch has no active recipe yet, cost is 0 but it's still "known".
 */
async function buildCostMap(
  ingSkus: string[],
  brand: BrandId,
  supabase: SupabaseClient,
): Promise<{ costMap: Map<string, number>; semiSkuSet: Set<string> }> {
  if (ingSkus.length === 0) return { costMap: new Map(), semiSkuSet: new Set() }

  const [
    { data: rawCosts },
    { data: semiRecipes },
    { data: semiProds },
    { data: semiProdsLegacy },
  ] = await Promise.all([
    (supabase.from('ingredients') as any)
      .select('sku, cost')
      .eq('brand_id', brand)
      .in('sku', ingSkus),
    (supabase.from('recipes') as any)
      .select('sku, total_cost, yield_portions')
      .eq('brand_id', brand)
      .eq('is_semi', true)
      .eq('is_active', true)
      .in('sku', ingSkus),
    // No brand filter: a batch can be used as ingredient regardless of which brand "owns" it.
    // Brand isolation for ownership is enforced in analyzeImportData; here we just need existence.
    (supabase.from('batches') as any)
      .select('sku')
      .in('sku', ingSkus),
    // Legacy: batches stored in products table (is_semi=true) before migration 009
    (supabase.from('products') as any)
      .select('sku')
      .eq('brand_id', brand)
      .eq('is_semi', true)
      .in('sku', ingSkus),
  ])

  const costMap = new Map<string, number>()
  for (const i of rawCosts || []) costMap.set(i.sku, i.cost)
  for (const r of semiRecipes || []) {
    if (r.yield_portions > 0) costMap.set(r.sku, r.total_cost / r.yield_portions)
  }

  // semiSkuSet = all SKUs known to be batches (regardless of whether they have a recipe)
  const semiSkuSet = new Set<string>([
    ...(semiProds || []).map((p: any) => p.sku),
    ...(semiProdsLegacy || []).map((p: any) => p.sku),
    ...(semiRecipes || []).map((r: any) => r.sku),  // batches with active recipes are also "known"
  ])
  for (const sku of semiSkuSet) {
    if (!costMap.has(sku)) costMap.set(sku, 0)
  }

  return { costMap, semiSkuSet }
}

// ── Analyzer ──────────────────────────────────────────────────────

export async function analyzeImportData(
  parsed: ParseResult,
  brand: BrandId,
  supabase: SupabaseClient,
): Promise<ImportAnalysis> {
  const { rows } = parsed

  if (rows.length === 0) {
    return { products: [], summary: { totalProducts: 0, newProducts: 0, totalVersions: 0, toImport: 0, duplicates: 0, errors: 0 } }
  }

  // Separate product SKUs by category to avoid cross-table SKU collisions
  const allMealSkus  = [...new Set(rows.filter(r => r.product_category === 'Meal').map(r => r.product_sku))]
  const allBatchSkus = [...new Set(rows.filter(r => r.product_category === 'Batch').map(r => r.product_sku))]
  const allIngSkus   = [...new Set(rows.map(r => r.ing_sku))]
  // If all rows are Batch, recipes must be queried with is_semi=true to avoid SKU collision with products
  const isBatchMode  = allMealSkus.length === 0

  const [mealsResult, batchesResult, recipesResult, costData] = await Promise.all([
    allMealSkus.length > 0
      ? (supabase.from('products') as any)
          .select('sku, name, category, price, app_price')
          .eq('brand_id', brand)
          .in('sku', allMealSkus)
      : Promise.resolve({ data: [] as any[] }),
    allBatchSkus.length > 0
      ? (supabase.from('batches') as any)
          .select('sku, name, unit')
          .eq('brand_id', brand)
          .in('sku', allBatchSkus)
      : Promise.resolve({ data: [] as any[] }),
    (supabase.from('recipes') as any)
      .select('id, sku, version, is_active, is_approved, recipe_ingredients(*)')
      .eq('brand_id', brand)
      .eq('is_semi', isBatchMode)
      .in('sku', isBatchMode ? allBatchSkus : allMealSkus),
    buildCostMap(allIngSkus, brand, supabase),
  ])

  const { data: dbMeals }   = mealsResult
  const { data: dbBatches } = batchesResult
  const { data: dbRecipes } = recipesResult
  const { costMap, semiSkuSet } = costData

  // Build product existence sets separately per table — no cross-contamination
  const dbMealSet    = new Set<string>((dbMeals   || []).map((p: any) => p.sku))
  const dbBatchSet   = new Set<string>((dbBatches || []).map((b: any) => b.sku))
  const dbProductMap = new Map<string, any>()
  for (const p of dbMeals   || []) dbProductMap.set(p.sku, p)
  for (const b of dbBatches || []) dbProductMap.set(b.sku, { ...b, category: 'Batch', price: 0, app_price: null })

  // Build existing recipes map: sku → list of recipe records
  const existingRecipes = new Map<string, any[]>()
  for (const rec of dbRecipes || []) {
    if (!existingRecipes.has(rec.sku)) existingRecipes.set(rec.sku, [])
    existingRecipes.get(rec.sku)!.push(rec)
  }

  // Group parsed rows by (product_sku, version_name)
  const productVersionMap = new Map<string, Map<string, ImportIngredientRow[]>>()
  const productMeta = new Map<string, {
    name: string; category: 'Meal' | 'Batch'
    yield_portions: number; sell_price: number; app_price: number | null
  }>()

  for (const r of rows) {
    if (!productVersionMap.has(r.product_sku)) productVersionMap.set(r.product_sku, new Map())
    if (!productVersionMap.get(r.product_sku)!.has(r.version_name)) {
      productVersionMap.get(r.product_sku)!.set(r.version_name, [])
    }
    productVersionMap.get(r.product_sku)!.get(r.version_name)!.push({
      ing_sku: r.ing_sku, ing_name: r.ing_name,
      qty: r.qty, unit: r.unit, yield_pct: r.yield_pct,
      section: r.section, service_type: r.service_type,
    })
    if (!productMeta.has(r.product_sku)) {
      productMeta.set(r.product_sku, {
        name: r.product_name, category: r.product_category,
        yield_portions: r.yield_portions, sell_price: r.sell_price, app_price: r.app_price,
      })
    }
  }

  const products: ImportProduct[] = []

  for (const [sku, versionMap] of productVersionMap) {
    const meta = productMeta.get(sku)!
    // Check existence in the correct table based on category (prevents SKU collision)
    const isNew = meta.category === 'Batch' ? !dbBatchSet.has(sku) : !dbMealSet.has(sku)
    const existingRecs = existingRecipes.get(sku) ?? []
    const activeRec = existingRecs.find((r: any) => r.is_active) ?? null

    const dbProd = dbProductMap.get(sku)
    const sellPrice = dbProd ? dbProd.price : meta.sell_price
    const appPrice  = dbProd ? dbProd.app_price : meta.app_price

    const versions: ImportVersion[] = []

    for (const [versionName, ingredients] of versionMap) {
      const key = `${sku}::${versionName}`

      // A SKU is truly unknown only if it's neither a raw ingredient nor a semi-product
      const unknownSkus = ingredients
        .filter(i => !costMap.has(i.ing_sku) && !semiSkuSet.has(i.ing_sku))
        .map(i => i.ing_sku)

      const enrichedRows: RecipeRowDraft[] = ingredients.map((i, idx) => ({
        id: `import-${idx}`,
        ing_sku: i.ing_sku,
        ing_name: i.ing_name,
        qty: i.qty,
        unit: i.unit,
        unit_cost: costMap.get(i.ing_sku) ?? 0,
        yield_pct: i.yield_pct,
        is_semi: semiSkuSet.has(i.ing_sku),  // ← correct semi flag
        section: i.section,
        service_type: i.service_type,
      }))

      const foodRows = enrichedRows.filter(r => r.section === 'food')
      const diPkg    = enrichedRows.filter(r => r.section === 'packaging' && r.service_type !== 'dine_out')
      const diResult = calcServiceCost(foodRows, diPkg, meta.yield_portions, sellPrice, appPrice)

      let status: ImportStatus
      let statusMessage: string

      if (isNew) {
        status = 'new_product'
        statusMessage = meta.category === 'Batch' ? 'باتش جديد + وصفة جديدة' : 'منتج جديد + وصفة جديدة'
      } else if (existingRecs.length === 0) {
        status = 'new_recipe'
        statusMessage = 'أول وصفة لهذا المنتج'
      } else {
        const importFP = ingredientFingerprint(ingredients)
        const isDuplicate = existingRecs.some((rec: any) =>
          existingFingerprint(rec.recipe_ingredients || []) === importFP,
        )
        if (isDuplicate) {
          status = 'duplicate'
          statusMessage = 'مكونات مطابقة لإصدار موجود — سيتم تخطيها'
        } else {
          status = 'new_version'
          if (activeRec && activeRec.is_approved === false) {
            statusMessage = 'مكونات مختلفة — الإصدار النشط غير معتمد، اختر: تعديل الحالي أو إصدار جديد'
          } else {
            statusMessage = 'مكونات مختلفة — سيُضاف إصدار جديد (الإصدار النشط معتمد)'
          }
        }
      }

      versions.push({
        key,
        version_name: versionName,
        yield_portions: meta.yield_portions,
        ingredients,
        status,
        statusMessage,
        total_cost: diResult.totalCost,
        food_cost_pct: diResult.foodCostPct,
        margin: diResult.margin,
        unknownSkus,
        activeRecipeId: activeRec?.id ?? null,
        activeVersionNumber: activeRec?.version ?? null,
        activeRecipeApproved: activeRec != null ? (activeRec.is_approved ?? false) : null,
      })
    }

    products.push({ sku, name: meta.name, category: meta.category, sell_price: sellPrice, app_price: appPrice, isNew, versions })
  }

  const allVersions = products.flatMap(p => p.versions)
  return {
    products,
    summary: {
      totalProducts: products.length,
      newProducts: products.filter(p => p.isNew).length,
      totalVersions: allVersions.length,
      toImport: allVersions.filter(v => v.status !== 'duplicate').length,
      duplicates: allVersions.filter(v => v.status === 'duplicate').length,
      errors: 0,
    },
  }
}

// ── Numeric safety ────────────────────────────────────────────────

/**
 * Clamp and round a number to fit a PostgreSQL numeric(precision, scale) column.
 * Returns 0 for NaN / Infinity.
 * Examples:
 *   numeric(10,4)  → precision=10, scale=4 → max  999999.9999
 *   numeric(5,1)   → precision=5,  scale=1 → max    9999.9
 *   numeric(10,6)  → precision=10, scale=6 → max    9999.999999
 */
function safeNum(v: number, precision: number, scale: number): number {
  if (!isFinite(v) || isNaN(v)) return 0
  const maxIntDigits = precision - scale
  const maxAbs = Math.pow(10, maxIntDigits) - Math.pow(10, -scale)
  const clamped = Math.min(Math.max(v, -maxAbs), maxAbs)
  return parseFloat(clamped.toFixed(scale))
}

// ── Executor ──────────────────────────────────────────────────────

export interface ExecuteResult {
  succeeded: string[]
  failed: { key: string; error: string }[]
}

export async function executeImport(
  selectedKeys: Set<string>,
  modes: Record<string, ImportVersionMode>,  // key → 'new_version' | 'overwrite'
  analysis: ImportAnalysis,
  brand: BrandId,
  userId: string | null,
  supabase: SupabaseClient,
): Promise<ExecuteResult> {
  const succeeded: string[] = []
  const failed: { key: string; error: string }[] = []

  for (const product of analysis.products) {
    const selectedVersions = product.versions.filter(
      v => selectedKeys.has(v.key) && v.status !== 'duplicate',
    )
    if (selectedVersions.length === 0) continue

    const isBatch = product.category === 'Batch'

    // Create product/batch if new
    if (product.isNew) {
      const insertPayload = isBatch
        ? { sku: product.sku, brand_id: brand, name: product.name, unit: 'وحدة' }
        : { sku: product.sku, brand_id: brand, name: product.name, category: 'Meal', price: product.sell_price, app_price: product.app_price, is_base: false, unit: null }
      const table = isBatch ? 'batches' : 'products'
      const { error: prodErr } = await (supabase.from(table) as any).insert(insertPayload)
      if (prodErr) {
        for (const v of selectedVersions) failed.push({ key: v.key, error: `فشل إنشاء ${isBatch ? 'الباتش' : 'المنتج'}: ${prodErr.message}` })
        continue
      }
    }

    // Fetch current version count for this product (needed for new_version mode)
    const { data: existingRecs } = await (supabase.from('recipes') as any)
      .select('id, version, is_active')
      .eq('sku', product.sku)
      .eq('brand_id', brand)
      .eq('is_semi', isBatch)
    const maxExistingVersion = (existingRecs || []).length > 0
      ? Math.max(...(existingRecs as any[]).map((r: any) => r.version))
      : 0

    let newVersionOffset = 0  // increments for each new_version in this batch

    for (const v of selectedVersions) {
      const mode = modes[v.key] ?? 'new_version'
      try {
        // Get costs (including semi-products) at execution time
        const allIngSkus = v.ingredients.map(i => i.ing_sku)
        const { costMap, semiSkuSet } = await buildCostMap(allIngSkus, brand, supabase)

        const enriched: RecipeRowDraft[] = v.ingredients.map((i, idx) => ({
          id: `tmp-${idx}`,
          ing_sku: i.ing_sku, ing_name: i.ing_name,
          qty: i.qty, unit: i.unit,
          unit_cost: costMap.get(i.ing_sku) ?? 0,
          yield_pct: i.yield_pct,
          is_semi: semiSkuSet.has(i.ing_sku),  // ← correct semi flag
          section: i.section, service_type: i.service_type,
        }))

        const foodRows = enriched.filter(r => r.section === 'food')
        const diPkg    = enriched.filter(r => r.section === 'packaging' && r.service_type !== 'dine_out')
        const doPkg    = enriched.filter(r => r.section === 'packaging' && r.service_type !== 'dine_in')
        const diRes    = calcServiceCost(foodRows, diPkg, v.yield_portions, product.sell_price, product.app_price)
        const doRes    = calcServiceCost(foodRows, doPkg, v.yield_portions, product.sell_price, product.app_price)

        // numeric(10,2)=sell_price, numeric(10,4)=total_cost, numeric(5,1)=food_cost_pct, numeric(10,2)=margin
        const costPayload = {
          product_name: product.name,
          is_semi: product.category === 'Batch',
          sell_price:               safeNum(product.sell_price,         10, 2),
          app_price:                product.app_price != null ? safeNum(product.app_price, 10, 2) : null,
          yield_portions:           Math.max(1, Math.round(v.yield_portions)),
          total_cost:               safeNum(diRes.totalCost,            10, 4),
          food_cost_pct:            safeNum(diRes.foodCostPct,           5, 1),
          margin:                   safeNum(diRes.margin,               10, 2),
          margin_app:               diRes.marginApp != null ? safeNum(diRes.marginApp, 10, 2) : null,
          dine_out_total_cost:      safeNum(doRes.totalCost,            10, 4),
          dine_out_food_cost_pct:   safeNum(doRes.foodCostPct,           5, 1),
          dine_out_margin:          safeNum(doRes.margin,               10, 2),
          saved_by: userId,
          saved_at: new Date().toISOString(),
        }

        // numeric(10,3)=qty, numeric(10,6)=unit_cost, numeric(5,1)=yield_pct
        const ingredientRows = v.ingredients.map((i, idx) => ({
          ing_sku: i.ing_sku, ing_name: i.ing_name,
          qty:       safeNum(i.qty,                              10, 3),
          unit:      i.unit,
          unit_cost: safeNum(costMap.get(i.ing_sku) ?? 0,       10, 6),
          yield_pct: safeNum(i.yield_pct,                        5, 1),
          is_semi:   semiSkuSet.has(i.ing_sku),
          section:   i.section, service_type: i.service_type,
          sort_order: idx,
        }))

        if (mode === 'overwrite' && v.activeRecipeId) {
          // ── Overwrite: update existing active recipe in place ────
          const { error: updErr } = await (supabase.from('recipes') as any)
            .update({ ...costPayload, version_name: v.version_name })
            .eq('id', v.activeRecipeId)
          if (updErr) throw updErr

          // Delete old ingredients and insert new ones
          const { error: delErr } = await (supabase.from('recipe_ingredients') as any)
            .delete()
            .eq('recipe_id', v.activeRecipeId)
          if (delErr) throw delErr

          if (ingredientRows.length > 0) {
            const { error: ingErr } = await (supabase.from('recipe_ingredients') as any)
              .insert(ingredientRows.map(r => ({ ...r, recipe_id: v.activeRecipeId })))
            if (ingErr) throw ingErr
          }
        } else {
          // ── New version: insert a fresh recipe row ────────────────
          const versionNumber = maxExistingVersion + newVersionOffset + 1
          const isFirstEver = maxExistingVersion === 0 && newVersionOffset === 0
          newVersionOffset++

          const { data: newRec, error: recErr } = await (supabase.from('recipes') as any)
            .insert({
              sku: product.sku,
              brand_id: brand,
              version: versionNumber,
              version_name: v.version_name,
              is_active: isFirstEver,
              is_approved: false,
              ...costPayload,
            })
            .select()
            .single()
          if (recErr) throw recErr

          if (ingredientRows.length > 0) {
            const { error: ingErr } = await (supabase.from('recipe_ingredients') as any)
              .insert(ingredientRows.map(r => ({ ...r, recipe_id: (newRec as any).id })))
            if (ingErr) throw ingErr
          }
        }

        succeeded.push(v.key)
      } catch (e: any) {
        failed.push({ key: v.key, error: e.message })
      }
    }
  }

  return { succeeded, failed }
}
