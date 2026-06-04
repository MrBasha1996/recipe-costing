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
      const msg = result.error.errors[0]?.message ?? 'خطأ غير معروف'
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
      const msg = result.error.errors[0]?.message ?? 'خطأ غير معروف'
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
    'إجمالي الفاتورة (ريال)': 400, 'تكلفة/وحدة الوصفة (ريال)': 0.04,
  }])
  ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 24 }]
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
            .filter(r => r['اسم المادة'] && r['إجمالي الفاتورة (ريال)'])
            .map(r => ({
              purchase_date: String(r['التاريخ (YYYY-MM-DD)'] ?? '').trim(),
              supplier_name: String(r['اسم المورد'] ?? '').trim(),
              ing_sku: String(r['SKU المادة'] ?? '').trim(),
              ing_name: String(r['اسم المادة'] ?? '').trim(),
              qty: parseFloat(r['الكمية']) || 0,
              unit: String(r['الوحدة'] ?? '').trim(),
              total_price: parseFloat(r['إجمالي الفاتورة (ريال)']) || 0,
              unit_cost: parseFloat(r['تكلفة/وحدة الوصفة (ريال)']) || 0,
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

export async function exportPLReport(data: {
  month: string; brand: string; revenue: number
  materialCost: number; laborCost: number; overheadCost: number
  rows: { label: string; amount: number; pct?: number }[]
}): Promise<void> {
  const X = await xlsx()
  const wb = X.utils.book_new()
  const net = data.revenue - data.materialCost - data.laborCost - data.overheadCost
  const pct = (v: number) => data.revenue > 0 ? `${((v / data.revenue) * 100).toFixed(1)}%` : '—'
  const ws = X.utils.json_to_sheet([
    { 'البيان': 'الإيراد (قبل VAT)',    'المبلغ (ريال)': data.revenue,        'النسبة %': '100%' },
    { 'البيان': 'تكلفة المواد الخام',   'المبلغ (ريال)': -data.materialCost,   'النسبة %': pct(data.materialCost) },
    { 'البيان': 'تكاليف العمالة',        'المبلغ (ريال)': -data.laborCost,      'النسبة %': pct(data.laborCost) },
    { 'البيان': 'التكاليف الثابتة',      'المبلغ (ريال)': -data.overheadCost,   'النسبة %': pct(data.overheadCost) },
    { 'البيان': '─────────────',          'المبلغ (ريال)': '',                   'النسبة %': '' },
    { 'البيان': 'صافي الربح',             'المبلغ (ريال)': net,                  'النسبة %': pct(net) },
  ])
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }]
  X.utils.book_append_sheet(wb, ws, `P&L ${data.month}`)
  X.writeFile(wb, `تقرير_الأرباح_والخسائر_${data.month}_${data.brand}.xlsx`)
}
