import * as XLSX from 'xlsx'
import type { Recipe, Ingredient, PurchaseRow, SaleRow } from '@/types'

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

// ── Export ────────────────────────────────────────────────────────

export function exportRecipesExcel(
  recipes: Recipe[],
  recipeIngredients: RecipeIngredientExport[],
  priceHistory: any[],
): void {
  const wb = XLSX.utils.book_new()

  // Sheet 1: ملخص الوصفات
  const summaryRows = recipes.map(r => ({
    'SKU': r.sku,
    'اسم المنتج': r.product_name,
    'نوع': r.is_semi ? 'Batch' : 'Meal',
    'عدد الحصص': r.yield_portions,
    'إجمالي التكلفة (ر.س)': r.total_cost,
    'تكلفة الحصة (ر.س)': r.yield_portions > 0
      ? parseFloat((r.total_cost / r.yield_portions).toFixed(4))
      : r.total_cost,
    'سعر البيع (ر.س)': r.sell_price,
    'سعر التطبيق (ر.س)': r.app_price ?? '',
    'Food Cost %': r.food_cost_pct,
    'هامش الربح (ر.س)': r.margin,
    'هامش التطبيق (ر.س)': r.margin_app ?? '',
    'آخر حفظ': r.saved_at ? new Date(r.saved_at).toLocaleDateString('ar-SA') : '',
  }))

  const ws1 = XLSX.utils.json_to_sheet(summaryRows)
  ws1['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 8 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
    { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'ملخص الوصفات')

  // Sheet 2: تفاصيل المكونات
  const ingRows = recipeIngredients.map(r => ({
    'SKU الوصفة': r.recipe_sku,
    'اسم الوصفة': r.recipe_name,
    'SKU المكوّن': r.ing_sku,
    'اسم المكوّن': r.ing_name,
    'الكمية': r.qty,
    'الوحدة': r.unit,
    'التكلفة/وحدة (ر.س)': r.unit_cost,
    'Yield %': r.yield_pct,
    'تكلفة السطر (ر.س)': parseFloat(r.line_cost.toFixed(4)),
  }))

  const ws2 = XLSX.utils.json_to_sheet(ingRows)
  ws2['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 30 },
    { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'تفاصيل المكونات')

  // Sheet 3: تاريخ الأسعار
  if (priceHistory.length > 0) {
    const histRows = priceHistory.map((h: any) => ({
      'SKU': h.sku,
      'الاسم': h.item_name,
      'النوع': h.item_type === 'ingredient' ? 'مادة خام' : 'منتج',
      'السعر القديم': h.old_price,
      'السعر الجديد': h.new_price,
      'الفرق': parseFloat((h.new_price - h.old_price).toFixed(6)),
      'التاريخ': new Date(h.changed_at).toLocaleDateString('ar-SA'),
    }))
    const ws3 = XLSX.utils.json_to_sheet(histRows)
    ws3['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws3, 'تاريخ الأسعار')
  }

  const filename = `وصفات_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── Price Template ────────────────────────────────────────────────

export function downloadPriceTemplate(ingredients: Ingredient[]): void {
  const wb = XLSX.utils.book_new()
  const rows = ingredients.map(i => ({
    'SKU': i.sku,
    'الاسم': i.name,
    'الفئة': i.category,
    'الوحدة': i.unit,
    'التكلفة الحالية': i.cost,
    'التكلفة الجديدة': '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 15 }, { wch: 32 }, { wch: 15 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'أسعار')
  XLSX.writeFile(wb, 'template_أسعار.xlsx')
}

// ── Price Import Parser ───────────────────────────────────────────

export function parsePriceFile(file: File): Promise<PriceChange[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws)

        const changes: PriceChange[] = rows
          .filter(r => {
            const val = r['التكلفة الجديدة']
            return val != null && val !== '' && !isNaN(parseFloat(val))
          })
          .map(r => {
            const oldCost = parseFloat(r['التكلفة الحالية']) || 0
            const newCost = parseFloat(r['التكلفة الجديدة']) || 0
            return {
              sku: String(r['SKU'] ?? '').trim(),
              name: String(r['الاسم'] ?? '').trim(),
              category: String(r['الفئة'] ?? '').trim(),
              unit: String(r['الوحدة'] ?? '').trim(),
              oldCost,
              newCost,
              delta: newCost - oldCost,
              deltaPct: oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0,
            }
          })
          .filter(c => c.sku && Math.abs(c.delta) > 0.000001)

        resolve(changes)
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Purchases Template ────────────────────────────────────────────

export function downloadPurchasesTemplate(): void {
  const wb = XLSX.utils.book_new()
  const sample = [
    {
      'التاريخ (YYYY-MM-DD)': '2026-06-01',
      'اسم المورد': 'شركة الأغذية',
      'SKU المادة': 'sk-0001',
      'اسم المادة': 'كبدة معلاق',
      'الكمية': 10,
      'الوحدة': 'كيلو',
      'إجمالي الفاتورة (ريال)': 400,
      'تكلفة/وحدة الوصفة (ريال)': 0.04,
    },
  ]
  const ws = XLSX.utils.json_to_sheet(sample)
  ws['!cols'] = [
    { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 25 },
    { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 24 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'المشتريات')
  XLSX.writeFile(wb, 'قالب_المشتريات.xlsx')
}

export function parsePurchasesFile(file: File): Promise<PurchaseRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws)
        const parsed: PurchaseRow[] = rows
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
        resolve(parsed)
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Sales Template ────────────────────────────────────────────────

export function downloadSalesTemplate(): void {
  const wb = XLSX.utils.book_new()
  const sample = [
    {
      'التاريخ (YYYY-MM-DD)': '2026-06-01',
      'SKU المنتج': 'sk-0001',
      'اسم المنتج': 'فول جره',
      'الكمية المباعة': 25,
      'الإيراد (ريال شامل VAT)': 375,
    },
  ]
  const ws = XLSX.utils.json_to_sheet(sample)
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, ws, 'المبيعات')
  XLSX.writeFile(wb, 'قالب_المبيعات.xlsx')
}

export function parseSalesFile(file: File): Promise<SaleRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws)
        const parsed: SaleRow[] = rows
          .filter(r => r['اسم المنتج'] && r['الإيراد (ريال شامل VAT)'])
          .map(r => ({
            sale_date: String(r['التاريخ (YYYY-MM-DD)'] ?? '').trim(),
            product_sku: String(r['SKU المنتج'] ?? '').trim(),
            product_name: String(r['اسم المنتج'] ?? '').trim(),
            qty_sold: parseFloat(r['الكمية المباعة']) || 0,
            revenue: parseFloat(r['الإيراد (ريال شامل VAT)']) || 0,
          }))
          .filter(r => r.product_name && r.revenue > 0)
        resolve(parsed)
      } catch (err: any) {
        reject(new Error(`خطأ في تحليل الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── P&L Export ───────────────────────────────────────────────────

export function exportPLReport(data: {
  month: string
  brand: string
  revenue: number
  materialCost: number
  laborCost: number
  overheadCost: number
  rows: { label: string; amount: number; pct?: number }[]
}): void {
  const wb = XLSX.utils.book_new()
  const summaryRows = [
    { 'البيان': 'الإيراد (قبل VAT)', 'المبلغ (ريال)': data.revenue, 'النسبة %': '100%' },
    { 'البيان': 'تكلفة المواد الخام', 'المبلغ (ريال)': -data.materialCost, 'النسبة %': `${((data.materialCost / data.revenue) * 100).toFixed(1)}%` },
    { 'البيان': 'تكاليف العمالة', 'المبلغ (ريال)': -data.laborCost, 'النسبة %': `${((data.laborCost / data.revenue) * 100).toFixed(1)}%` },
    { 'البيان': 'التكاليف الثابتة', 'المبلغ (ريال)': -data.overheadCost, 'النسبة %': `${((data.overheadCost / data.revenue) * 100).toFixed(1)}%` },
    { 'البيان': '─────────────', 'المبلغ (ريال)': '', 'النسبة %': '' },
    {
      'البيان': 'صافي الربح',
      'المبلغ (ريال)': data.revenue - data.materialCost - data.laborCost - data.overheadCost,
      'النسبة %': `${(((data.revenue - data.materialCost - data.laborCost - data.overheadCost) / data.revenue) * 100).toFixed(1)}%`,
    },
  ]
  const ws = XLSX.utils.json_to_sheet(summaryRows)
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, `P&L ${data.month}`)
  XLSX.writeFile(wb, `تقرير_الأرباح_والخسائر_${data.month}_${data.brand}.xlsx`)
}
