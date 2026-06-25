// Foodics export parser
// Handles the ="..." cell format that Foodics uses in its CSV/Excel exports

import type { SaleRow, FoodicsCancellationRow, FoodicsModifierRow } from '@/types'

// ── Cell cleaning ─────────────────────────────────────────────────

function cleanCell(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  // Remove ="..." wrapping (Foodics quirk)
  if (s.startsWith('="') && s.endsWith('"')) return s.slice(2, -1).trim()
  if (s.startsWith('=')) return s.slice(1).trim()
  return s
}

function toNum(raw: unknown): number {
  const s = cleanCell(raw).replace(/,/g, '')  // remove thousands commas
  return parseFloat(s) || 0
}

// ── Detect if a file is from Foodics ─────────────────────────────
// Returns true when the first row/cell contains the Foodics ="..." pattern
// or known Arabic Foodics report headers

export function isFoodicsFile(rows: unknown[][]): boolean {
  if (rows.length < 2) return false
  const cell0 = String(rows[0]?.[0] ?? '')
  return (
    cell0.includes('المبيعات حسب الفرع') ||
    cell0.includes('الإلغاءات و المرتجعات') ||
    cell0.startsWith('="')
  )
}

// ── Find the actual data header row ──────────────────────────────
// Foodics files have 4-6 metadata rows before the real column headers

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const first  = cleanCell(rows[i][0])
    const second = cleanCell(rows[i][1])
    // Sales report header
    if (first === 'الفرع') return i
    // Cancellations report header
    if (first === 'المنتج' && second === 'الفرع') return i
    // Purchases (stock history) report header
    if (first === 'Name' && second === 'SKU') return i
    // Modifiers report header
    if (first === 'خيار الإضافة') return i
  }
  return -1
}

// ── Build a column-index map from the header row ──────────────────

function buildColMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, i) => {
    const key = cleanCell(cell)
    if (key) map[key] = i
  })
  return map
}

// ── Parse sale date from metadata ─────────────────────────────────
// "2026-06-03 - 2026-06-03" → "2026-06-03"

function extractDateFromMeta(rows: unknown[][]): string {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const key   = cleanCell(rows[i][0])
    const value = cleanCell(rows[i][1])
    if (key === 'النطاق الزمني' && value) {
      // "2026-06-03 - 2026-06-03" → take the start date
      return value.split(' - ')[0].trim()
    }
  }
  return new Date().toISOString().slice(0, 10)
}

// "2026-06-01 - 2026-06-30" → { dateFrom: "2026-06-01", dateTo: "2026-06-30" }
function extractDateRangeFromMeta(rows: unknown[][]): { dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const key   = cleanCell(rows[i][0])
    const value = cleanCell(rows[i][1])
    if (key === 'النطاق الزمني' && value) {
      const parts = value.split(' - ')
      return {
        dateFrom: parts[0]?.trim() ?? today,
        dateTo:   parts[1]?.trim() ?? today,
      }
    }
  }
  return { dateFrom: today, dateTo: today }
}

// ── Sales Report Parser ───────────────────────────────────────────

export function parseFoodicsSales(rawRows: unknown[][]): SaleRow[] {
  const saleDate  = extractDateFromMeta(rawRows)
  const headerIdx = findHeaderRow(rawRows)
  if (headerIdx === -1) return []

  const colMap = buildColMap(rawRows[headerIdx])
  const results: SaleRow[] = []

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const branchName = cleanCell(row[colMap['الفرع']])
    // Skip total/summary rows (empty branch = summary row)
    if (!branchName) continue

    const productSku  = cleanCell(row[colMap['كود تعريف المنتج']])
    const productName = cleanCell(row[colMap['المنتج']])
    if (!productName) continue

    results.push({
      sale_date:       saleDate,
      product_sku:     productSku,
      product_name:    productName,
      qty_sold:        toNum(row[colMap['صافي الكمية']]),
      // Revenue = صافي المبيعات مع الضريبة (net sales including tax, after returns)
      revenue:         toNum(row[colMap['صافي المبيعات مع الضريبة']]),
      branch_name:     branchName,
      branch_ref:      cleanCell(row[colMap['مرجع الفرع']]),
      tax_amount:      toNum(row[colMap['الضرائب']]),
      discount_amount: toNum(row[colMap['مبلغ الخصم']]),
      return_amount:   toNum(row[colMap['مبلغ الإرجاع']]),
      return_qty:      toNum(row[colMap['كمية المرتجع']]),
      cancel_amount:   toNum(row[colMap['مبلغ الإلغاء']]),
      cancel_qty:      toNum(row[colMap['كمية الإلغاء']]),
      cost_pos:        toNum(row[colMap['التكلفة']]),
      source:          'foodics',
    })
  }

  return results.filter(r => r.revenue !== 0 || r.qty_sold !== 0)
}

// ── Cancellations Report Parser ───────────────────────────────────

export function parseFoodicsCancellations(rawRows: unknown[][]): FoodicsCancellationRow[] {
  const headerIdx = findHeaderRow(rawRows)
  if (headerIdx === -1) return []

  const colMap = buildColMap(rawRows[headerIdx])
  const results: FoodicsCancellationRow[] = []

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const productName = cleanCell(row[colMap['المنتج']])
    if (!productName) continue

    const typeRaw = cleanCell(row[colMap['النوع']])
    const wasWasted = cleanCell(row[colMap['هل تم إهداره']]) === 'نعم'

    results.push({
      product_name: productName,
      branch_name:  cleanCell(row[colMap['الفرع']]),
      branch_ref:   cleanCell(row[colMap['مرجع الفرع']]),
      waste_type:   typeRaw === 'مرتجع' ? 'return' : 'cancellation',
      order_ref:    cleanCell(row[colMap['مرجع الطلب']]),
      qty:          toNum(row[colMap['الكمية']]),
      value:        toNum(row[colMap['القيمة']]),
      reason:       cleanCell(row[colMap['السبب']]),
      was_wasted:   wasWasted,
    })
  }

  return results
}

// ── File type detector ────────────────────────────────────────────

// ── Purchases (تاريخ المخزون) Parser ─────────────────────────────

// Common purchase unit → recipe unit conversion factors
// e.g. 1 لتر = 1000 مليلتر, 1 كيلو = 1000 جرام
const UNIT_TO_RECIPE: Record<string, number> = {
  'لتر':   1000,
  'كيلو':  1000,
  'كغ':    1000,
  'kg':    1000,
  'l':     1000,
  'liter': 1000,
}

function costPerRecipeUnit(totalCost: number, qty: number, purchaseUnit: string): number {
  if (qty <= 0) return 0
  const perPurchaseUnit = totalCost / qty
  const factor = UNIT_TO_RECIPE[purchaseUnit.trim().toLowerCase()] ??
                 UNIT_TO_RECIPE[purchaseUnit.trim()] ?? 1
  return perPurchaseUnit / factor
}

export function parseFoodicsPurchases(rawRows: unknown[][], reportDate: string): import('@/types').PurchaseRow[] {
  const headerIdx = findHeaderRow(rawRows)
  if (headerIdx === -1) return []

  const colMap = buildColMap(rawRows[headerIdx])
  const results: import('@/types').PurchaseRow[] = []

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const name = cleanCell(row[colMap['Name']])
    if (!name) continue

    const txType = cleanCell(row[colMap['Transaction Type']])
    // Skip returns to supplier (مرتجع للمورد)
    if (txType === 'مرتجع للمورد') continue

    const sku       = cleanCell(row[colMap['SKU']])
    const unit      = cleanCell(row[colMap['Storage Unit']])
    const branch    = cleanCell(row[colMap['Branch']])
    const poRef     = cleanCell(row[colMap['Transaction Reference']])
    const qty       = toNum(row[colMap['Quantity']])
    const totalCost = toNum(row[colMap['Cost']])

    if (qty <= 0 || totalCost <= 0) continue

    results.push({
      purchase_date: reportDate,
      supplier_name: branch || poRef || 'Foodics',
      ing_sku:       sku,
      ing_name:      name,
      qty,
      unit,
      total_price: totalCost,
      unit_cost:   costPerRecipeUnit(totalCost, qty, unit),
    })
  }

  return results
}

export type FoodicsReportType = 'sales' | 'cancellations' | 'purchases' | 'modifiers' | 'unknown'

export function detectFoodicsReportType(rawRows: unknown[][]): FoodicsReportType {
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const cell = cleanCell(rawRows[i][0])
    if (cell.includes('المبيعات حسب الفرع'))    return 'sales'
    if (cell.includes('الإلغاءات و المرتجعات')) return 'cancellations'
    if (cell.includes('تاريخ المخزون'))          return 'purchases'
  }
  // Check header row as fallback
  const headerIdx = findHeaderRow(rawRows)
  if (headerIdx >= 0) {
    const first  = cleanCell(rawRows[headerIdx][0])
    const second = cleanCell(rawRows[headerIdx][1])
    if (first === 'الفرع')                       return 'sales'
    if (first === 'المنتج' && second === 'الفرع') return 'cancellations'
    if (first === 'Name'   && second === 'SKU')   return 'purchases'
    if (first === 'خيار الإضافة')                return 'modifiers'
  }
  return 'unknown'
}

// ── Modifiers Report Parser ───────────────────────────────────────
// Column التكلفة is intentionally ignored — costs are always calculated from our own ingredient data

export function parseFoodicsModifiers(rawRows: unknown[][]): FoodicsModifierRow[] {
  const headerIdx = findHeaderRow(rawRows)
  if (headerIdx === -1) return []

  const colMap = buildColMap(rawRows[headerIdx])
  const results: FoodicsModifierRow[] = []

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const optionName = cleanCell(row[colMap['خيار الإضافة']])
    if (!optionName) continue

    results.push({
      option_name:  optionName,
      option_sku:   cleanCell(row[colMap['كود تعريف خيار الإضافة']]),
      product_name: cleanCell(row[colMap['المنتج']]),
      product_sku:  cleanCell(row[colMap['كود تعريف المنتج']]),
      qty_sold:     toNum(row[colMap['صافي الكمية']]),
      revenue:      toNum(row[colMap['إجمالي المبيعات']]),
    })
  }

  return results.filter(r => r.qty_sold !== 0)
}

// ── Main entry: parse any Foodics file ───────────────────────────

export async function parseFoodicsFile(file: File): Promise<{
  type: FoodicsReportType
  sales: SaleRow[]
  cancellations: FoodicsCancellationRow[]
  purchases: import('@/types').PurchaseRow[]
  modifiers: FoodicsModifierRow[]
  date: string
  dateFrom: string
  dateTo: string
}> {
  const X = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb     = X.read(new Uint8Array(buffer), { type: 'array', raw: true })
  const ws     = wb.Sheets[wb.SheetNames[0]]

  const rawRows: unknown[][] = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })

  const type = detectFoodicsReportType(rawRows)
  const date = extractDateFromMeta(rawRows)
  const { dateFrom, dateTo } = extractDateRangeFromMeta(rawRows)

  return {
    type,
    date,
    dateFrom,
    dateTo,
    sales:         type === 'sales'         ? parseFoodicsSales(rawRows)              : [],
    cancellations: type === 'cancellations' ? parseFoodicsCancellations(rawRows)      : [],
    purchases:     type === 'purchases'     ? parseFoodicsPurchases(rawRows, date)    : [],
    modifiers:     type === 'modifiers'     ? parseFoodicsModifiers(rawRows)          : [],
  }
}
