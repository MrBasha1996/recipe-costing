// xlsx (~1 MB) is loaded lazily on first use — not bundled in the initial page load
let _xlsx: typeof import('xlsx') | null = null
async function xlsx() {
  if (!_xlsx) _xlsx = await import('xlsx')
  return _xlsx
}

import { z } from 'zod'
import type { Recipe, Ingredient, PurchaseRow, SaleRow } from '@/types'

// ── Zod Schemas ───────────────────────────────────────────────────

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const PurchaseRowSchema = z.object({
  purchase_date: z.string().regex(datePattern, 'تاريخ غير صالح (YYYY-MM-DD)'),
  supplier_name: z.string().min(1, 'اسم المورد مطلوب'),
  ing_name:      z.string().min(1, 'اسم المادة مطلوب'),
  ing_sku:       z.string(),
  qty:           z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unit:          z.string().min(1, 'الوحدة مطلوبة'),
  total_price:   z.number().positive('إجمالي الفاتورة يجب أن يكون أكبر من صفر'),
  unit_cost:     z.number().nonnegative(),
})

const SaleRowSchema = z.object({
  sale_date:    z.string().regex(datePattern, 'تاريخ غير صالح (YYYY-MM-DD)'),
  product_sku:  z.string(),
  product_name: z.string().min(1, 'اسم المنتج مطلوب'),
  qty_sold:     z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  revenue:      z.number().nonnegative('الإيراد لا يمكن أن يكون سالباً'),
})

/** Validates parsed rows and returns { valid, errors } */
export function validatePurchaseRows(rows: PurchaseRow[]): { valid: PurchaseRow[]; errors: string[] } {
  const valid: PurchaseRow[] = []
  const errors: string[] = []
  rows.forEach((row, i) => {
    const result = PurchaseRowSchema.safeParse(row)
    if (result.success) {
      valid.push(row)
    } else {
      const msg = result.error.issues[0]?.message ?? 'خطأ غير معروف'
      errors.push(`سطر ${i + 1} (${row.ing_name || '—'}): ${msg}`)
    }
  })
  return { valid, errors }
}

export function validateSaleRows(rows: SaleRow[]): { valid: SaleRow[]; errors: string[] } {
  const valid: SaleRow[] = []
  const errors: string[] = []
  rows.forEach((row, i) => {
    const result = SaleRowSchema.safeParse(row)
    if (result.success) {
      valid.push(row)
    } else {
      const msg = result.error.issues[0]?.message ?? 'خطأ غير معروف'
      errors.push(`سطر ${i + 1} (${row.product_name || '—'}): ${msg}`)
    }
  })
  return { valid, errors }
}

// ── Types ─────────────────────────────────────────────────────────

export interface RecipeIngredientExport {
  recipe_sku: string
  recipe_name: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  unit_cost: number
  yield_pct: number
  line_cost: number
}

export interface PriceChange {
  sku: string
  name: string
  category: string
  unit: string
  oldCost: number
  newCost: number
  delta: number
  deltaPct: number
}

// ── Recipes Export ────────────────────────────────────────────────

export async function exportRecipesExcel(
  recipes: Recipe[],
  recipeIngredients: RecipeIngredientExport[],
  priceHistory: any[],
): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()

  const ws1 = X.utils.json_to_sheet(recipes.map(r => ({
    'SKU': r.sku,
    'اسم المنتج': r.product_name,
    'نوع': r.is_semi ? 'Batch' : 'Meal',
    'عدد الحصص': r.yield_portions,
    'إجمالي التكلفة (ر.س)': r.total_cost,
    'تكلفة الحصة (ر.س)': r.yield_portions > 0 ? parseFloat((r.total_cost / r.yield_portions).toFixed(4)) : r.total_cost,
    'سعر البيع (ر.س)': r.sell_price,
    'سعر التطبيق (ر.س)': r.app_price ?? '',
    'Food Cost %': r.food_cost_pct,
    'هامش الربح (ر.س)': r.margin,
    'هامش التطبيق (ر.س)': r.margin_app ?? '',
    'آخر حفظ': r.saved_at ? new Date(r.saved_at).toLocaleDateString('ar-SA') : '',
  })))
  ws1['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }]
  X.utils.book_append_sheet(wb, ws1, 'ملخص الوصفات')

  const ws2 = X.utils.json_to_sheet(recipeIngredients.map(r => ({
    'SKU الوصفة': r.recipe_sku, 'اسم الوصفة': r.recipe_name,
    'SKU المكوّن': r.ing_sku, 'اسم المكوّن': r.ing_name,
    'الكمية': r.qty, 'الوحدة': r.unit,
    'التكلفة/وحدة (ر.س)': r.unit_cost, 'Yield %': r.yield_pct,
    'تكلفة السطر (ر.س)': parseFloat(r.line_cost.toFixed(4)),
  })))
  ws2['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 }]
  X.utils.book_append_sheet(wb, ws2, 'تفاصيل المكونات')

  if (priceHistory.length > 0) {
    const ws3 = X.utils.json_to_sheet(priceHistory.map((h: any) => ({
      'SKU': h.sku, 'الاسم': h.item_name,
      'النوع': h.item_type === 'ingredient' ? 'مادة خام' : 'منتج',
      'السعر القديم': h.old_price, 'السعر الجديد': h.new_price,
      'الفرق': parseFloat((h.new_price - h.old_price).toFixed(6)),
      'التاريخ': new Date(h.changed_at).toLocaleDateString('ar-SA'),
    })))
    ws3['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }]
    X.utils.book_append_sheet(wb, ws3, 'تاريخ الأسعار')
  }

  X.writeFile(wb, `وصفات_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Price Template ────────────────────────────────────────────────

export async function downloadPriceTemplate(ingredients: Ingredient[]): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()
  const ws = X.utils.json_to_sheet(ingredients.map(i => ({
    'SKU': i.sku, 'الاسم': i.name, 'الفئة': i.category,
    'الوحدة': i.unit, 'التكلفة الحالية': i.cost, 'التكلفة الجديدة': '',
  })))
  ws['!cols'] = [{ wch: 15 }, { wch: 32 }, { wch: 15 }, { wch: 10 }, { wch: 16 }, { wch: 16 }]
  X.utils.book_append_sheet(wb, ws, 'أسعار')
  X.writeFile(wb, 'template_أسعار.xlsx')
}

// ── Price Import Parser ───────────────────────────────────────────

export function parsePriceFile(file: File): Promise<PriceChange[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })
        const rows: any[] = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        resolve(
          rows
            .filter(r => { const v = r['التكلفة الجديدة']; return v != null && v !== '' && !isNaN(parseFloat(v)) })
            .map(r => {
              const oldCost = parseFloat(r['التكلفة الحالية']) || 0
              const newCost = parseFloat(r['التكلفة الجديدة']) || 0
              return {
                sku: String(r['SKU'] ?? '').trim(), name: String(r['الاسم'] ?? '').trim(),
                category: String(r['الفئة'] ?? '').trim(), unit: String(r['الوحدة'] ?? '').trim(),
                oldCost, newCost, delta: newCost - oldCost,
                deltaPct: oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0,
              }
            })
            .filter(c => c.sku && Math.abs(c.delta) > 0.000001)
        )
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Purchases Template ────────────────────────────────────────────

export async function downloadPurchasesTemplate(): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()
  const ws = X.utils.json_to_sheet([{
    'التاريخ (YYYY-MM-DD)': '2026-06-01', 'اسم المورد': 'شركة الأغذية',
    'SKU المادة': 'sk-0001', 'اسم المادة': 'كبدة معلاق',
    'الكمية': 10, 'الوحدة': 'كيلو',
    'إجمالي الفاتورة بدون ضريبة (ريال)': 400, 'تكلفة/وحدة الوصفة بدون ضريبة (ريال)': 0.04,
  }])
  ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 32 }]
  X.utils.book_append_sheet(wb, ws, 'المشتريات')
  X.writeFile(wb, 'قالب_المشتريات.xlsx')
}

export function parsePurchasesFile(file: File): Promise<PurchaseRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })
        const rows: any[] = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        resolve(
          rows
            .filter(r => r['اسم المادة'] && (r['إجمالي الفاتورة بدون ضريبة (ريال)'] || r['إجمالي الفاتورة (ريال)']))
            .map(r => ({
              purchase_date: String(r['التاريخ (YYYY-MM-DD)'] ?? '').trim(),
              supplier_name: String(r['اسم المورد'] ?? '').trim(),
              ing_sku: String(r['SKU المادة'] ?? '').trim(),
              ing_name: String(r['اسم المادة'] ?? '').trim(),
              qty: parseFloat(r['الكمية']) || 0,
              unit: String(r['الوحدة'] ?? '').trim(),
              total_price: parseFloat(r['إجمالي الفاتورة بدون ضريبة (ريال)'] ?? r['إجمالي الفاتورة (ريال)']) || 0,
              unit_cost: parseFloat(r['تكلفة/وحدة الوصفة بدون ضريبة (ريال)'] ?? r['تكلفة/وحدة الوصفة (ريال)']) || 0,
            }))
            .filter(r => r.ing_name && r.total_price > 0)
        )
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Sales Template ────────────────────────────────────────────────

export async function downloadSalesTemplate(): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()
  const ws = X.utils.json_to_sheet([{
    'التاريخ (YYYY-MM-DD)': '2026-06-01', 'SKU المنتج': 'sk-0001',
    'اسم المنتج': 'فول جره', 'الكمية المباعة': 25,
    'الإيراد (ريال شامل VAT)': 375,
  }])
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 22 }]
  X.utils.book_append_sheet(wb, ws, 'المبيعات')
  X.writeFile(wb, 'قالب_المبيعات.xlsx')
}

export function parseSalesFile(file: File): Promise<SaleRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })
        const rows: any[] = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        resolve(
          rows
            .filter(r => r['اسم المنتج'] && r['الإيراد (ريال شامل VAT)'])
            .map(r => ({
              sale_date: String(r['التاريخ (YYYY-MM-DD)'] ?? '').trim(),
              product_sku: String(r['SKU المنتج'] ?? '').trim(),
              product_name: String(r['اسم المنتج'] ?? '').trim(),
              qty_sold: parseFloat(r['الكمية المباعة']) || 0,
              revenue: parseFloat(r['الإيراد (ريال شامل VAT)']) || 0,
            }))
            .filter(r => r.product_name && r.revenue > 0)
        )
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── P&L Export ───────────────────────────────────────────────────

interface PLPeriodData {
  revenue: number; materialCost: number; laborCost: number
  overheadCost: number; deliveryCommission: number
  netProfit: number; grossProfit: number
  ovByCategory?: Record<string, number>
}

export async function exportPLReport(data: {
  month: string
  brand: string
  cur: PLPeriodData
  prev: PLPeriodData
  ly: PLPeriodData
  prevLabel: string
  lyLabel: string
}): Promise<void> {
  const X  = await xlsx()
  const wb = X.utils.book_new()

  const { cur, prev, ly } = data

  const pct = (v: number, base: number) => base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—'
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

  // Derive totals
  const totalOpEx     = cur.laborCost  + cur.overheadCost  + cur.deliveryCommission
  const totalOpExPrev = prev.laborCost + prev.overheadCost + prev.deliveryCommission
  const totalOpExLy   = ly.laborCost   + ly.overheadCost   + ly.deliveryCommission
  const primeCost     = cur.materialCost  + cur.laborCost
  const primePrev     = prev.materialCost + prev.laborCost
  const primeLy       = ly.materialCost   + ly.laborCost

  type Row = { 'البيان': string; [k: string]: string | number }
  const col = data.month
  const colP = data.prevLabel
  const colL = data.lyLabel

  function row(label: string, c: number, p: number, l: number, showPct = false): Row {
    const r: Row = { 'البيان': label, [col]: fmt(c), [colP]: fmt(p) }
    if (ly.revenue > 0) r[colL] = fmt(l)
    if (showPct) r['% من الإيراد'] = pct(c, cur.revenue)
    return r
  }
  function sep(label: string): Row {
    const r: Row = { 'البيان': label, [col]: '', [colP]: '' }
    if (ly.revenue > 0) r[colL] = ''
    return r
  }

  const ovCats = Object.entries(cur.ovByCategory ?? {}) as [string, number][]

  const rows: Row[] = [
    row('الإيراد (صافي قبل VAT)', cur.revenue, prev.revenue, ly.revenue),
    sep('── تكلفة البضاعة المباعة ──────────'),
    row('  تكلفة المواد الخام (COGS)', -cur.materialCost, -prev.materialCost, -ly.materialCost, true),
    row('مجمل الربح', cur.grossProfit, prev.grossProfit, ly.grossProfit, true),
    sep('── مصاريف التشغيل ──────────────────'),
    row('  تكاليف العمالة', -cur.laborCost, -prev.laborCost, -ly.laborCost, true),
    ...ovCats.map(([cat, val]) =>
      row(`  التكاليف الثابتة — ${cat}`, -val, 0, 0)
    ),
    row('  إجمالي التكاليف الثابتة', -cur.overheadCost, -prev.overheadCost, -ly.overheadCost, true),
    ...(cur.deliveryCommission > 0 || prev.deliveryCommission > 0
      ? [row('  عمولات التوصيل', -cur.deliveryCommission, -prev.deliveryCommission, -ly.deliveryCommission, true)]
      : []),
    row('إجمالي مصاريف التشغيل', -totalOpEx, -totalOpExPrev, -totalOpExLy, true),
    sep('── مؤشرات ──────────────────────────'),
    row('Prime Cost (مواد + عمالة)', -primeCost, -primePrev, -primeLy, true),
    sep('────────────────────────────────────'),
    row('صافي الربح', cur.netProfit, prev.netProfit, ly.netProfit, true),
  ]

  const ws = X.utils.json_to_sheet(rows)
  const colCount = ly.revenue > 0 ? 5 : 4
  ws['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 16 }, ...(ly.revenue > 0 ? [{ wch: 16 }] : []), { wch: 14 }]
  void colCount
  X.utils.book_append_sheet(wb, ws, `P&L ${data.month}`)
  X.writeFile(wb, `تقرير_الأرباح_والخسائر_${data.month}_${data.brand}.xlsx`)
}

// ── Modifiers Export ──────────────────────────────────────────────

export interface ModifierExportOption {
  group_name: string
  is_required: boolean
  min_select: number
  max_select: number
  option_sku: string
  option_name: string
  option_price: number
  total_cost: number
}

export interface ModifierExportIngredient {
  option_sku: string
  option_name: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  yield_pct: number
  unit_cost: number
}

export async function exportModifiersExcel(
  options: ModifierExportOption[],
  ingredients: ModifierExportIngredient[],
): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()

  const ws1 = X.utils.json_to_sheet(options.map(o => ({
    'اسم المجموعة':    o.group_name,
    'إجباري (نعم/لا)': o.is_required ? 'نعم' : 'لا',
    'الحد الأدنى':    o.min_select,
    'الحد الأقصى':    o.max_select,
    'كود الخيار (option_sku)': o.option_sku,
    'اسم الخيار':    o.option_name,
    'السعر (ر.س)':   o.option_price,
    'التكلفة (ر.س)': o.total_cost,
  })))
  ws1['!cols'] = [
    { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
  ]
  X.utils.book_append_sheet(wb, ws1, 'الإضافات')

  if (ingredients.length > 0) {
    const ws2 = X.utils.json_to_sheet(ingredients.map(i => ({
      'كود الخيار (option_sku)': i.option_sku,
      'اسم الخيار':   i.option_name,
      'كود المادة':   i.ing_sku,
      'اسم المادة':   i.ing_name,
      'الكمية':       i.qty,
      'الوحدة':       i.unit,
      'Yield %':      i.yield_pct,
      'تكلفة/وحدة':  i.unit_cost,
    })))
    ws2['!cols'] = [
      { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 28 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    ]
    X.utils.book_append_sheet(wb, ws2, 'المكونات')
  }

  X.writeFile(wb, `إضافات_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Modifiers Template ────────────────────────────────────────────

export async function downloadModifiersTemplate(): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()

  const ws1 = X.utils.json_to_sheet([
    {
      'اسم المجموعة': 'مثال: اختر المشروب',
      'إجباري (نعم/لا)': 'نعم',
      'الحد الأدنى': 1,
      'الحد الأقصى': 1,
      'كود الخيار (option_sku)': 'DRINK-001',
      'اسم الخيار': 'كولا',
      'السعر (ر.س)': 5,
    },
    {
      'اسم المجموعة': 'مثال: اختر المشروب',
      'إجباري (نعم/لا)': 'نعم',
      'الحد الأدنى': 1,
      'الحد الأقصى': 1,
      'كود الخيار (option_sku)': 'DRINK-002',
      'اسم الخيار': 'عصير برتقال',
      'السعر (ر.س)': 6,
    },
  ])
  ws1['!cols'] = [
    { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 28 }, { wch: 28 }, { wch: 14 },
  ]
  X.utils.book_append_sheet(wb, ws1, 'الإضافات')

  const ws2 = X.utils.json_to_sheet([
    {
      'كود الخيار (option_sku)': 'DRINK-001',
      'اسم الخيار': 'كولا',
      'كود المادة': 'COLA-CAN',
      'اسم المادة': 'علبة كولا',
      'الكمية': 1,
      'الوحدة': 'علبة',
      'Yield %': 100,
    },
  ])
  ws2['!cols'] = [
    { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 28 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
  ]
  X.utils.book_append_sheet(wb, ws2, 'المكونات')

  X.writeFile(wb, 'template_الإضافات.xlsx')
}

// ── Modifiers Import Parser ───────────────────────────────────────

export interface ParsedModifierOption {
  group_name: string
  is_required: boolean
  min_select: number
  max_select: number
  option_sku: string
  option_name: string
  option_price: number
}

export interface ParsedModifierIngredient {
  option_sku: string
  ing_sku: string
  qty: number
  unit: string
  yield_pct: number
}

export interface ParsedModifiersResult {
  options: ParsedModifierOption[]
  ingredients: ParsedModifierIngredient[]
  errors: string[]
}

export function parseModifiersFile(file: File): Promise<ParsedModifiersResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })

        const errors: string[] = []

        // ── Sheet 1: الإضافات ──────────────────────────────
        const sheetOptions = wb.Sheets['الإضافات'] ?? wb.Sheets[wb.SheetNames[0]]
        const rawOptions: any[] = X.utils.sheet_to_json(sheetOptions)

        const options: ParsedModifierOption[] = []
        rawOptions.forEach((r, i) => {
          const groupName = String(r['اسم المجموعة'] ?? '').trim()
          const optSku    = String(r['كود الخيار (option_sku)'] ?? '').trim()
          const optName   = String(r['اسم الخيار'] ?? '').trim()
          if (!groupName) { errors.push(`سطر ${i + 2}: اسم المجموعة فارغ`); return }
          if (!optSku)    { errors.push(`سطر ${i + 2}: كود الخيار فارغ`); return }
          if (!optName)   { errors.push(`سطر ${i + 2}: اسم الخيار فارغ`); return }

          const isRequired  = String(r['إجباري (نعم/لا)'] ?? '').trim() === 'نعم'
          const minSelect   = parseInt(r['الحد الأدنى']) || 0
          const maxSelect   = parseInt(r['الحد الأقصى']) || 1
          const optionPrice = parseFloat(r['السعر (ر.س)']) || 0

          options.push({ group_name: groupName, is_required: isRequired, min_select: minSelect, max_select: maxSelect, option_sku: optSku, option_name: optName, option_price: optionPrice })
        })

        // ── Sheet 2: المكونات (اختياري) ──────────────────────
        const ingredients: ParsedModifierIngredient[] = []
        const sheetIngs = wb.Sheets['المكونات']
        if (sheetIngs) {
          const rawIngs: any[] = X.utils.sheet_to_json(sheetIngs)
          rawIngs.forEach((r, i) => {
            const optSku = String(r['كود الخيار (option_sku)'] ?? '').trim()
            const ingSku = String(r['كود المادة'] ?? '').trim()
            const qty    = parseFloat(r['الكمية']) || 0
            const unit   = String(r['الوحدة'] ?? '').trim()
            if (!optSku || !ingSku) {
              errors.push(`مكونات سطر ${i + 2}: كود الخيار أو كود المادة فارغ`)
              return
            }
            if (qty <= 0) { errors.push(`مكونات سطر ${i + 2} (${ingSku}): الكمية يجب أن تكون أكبر من صفر`); return }
            const yieldPct = parseFloat(r['Yield %']) || 100
            ingredients.push({ option_sku: optSku, ing_sku: ingSku, qty, unit: unit || 'وحدة', yield_pct: yieldPct })
          })
        }

        resolve({ options, ingredients, errors })
      } catch (err: any) {
        reject(new Error(`خطأ في قراءة الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
