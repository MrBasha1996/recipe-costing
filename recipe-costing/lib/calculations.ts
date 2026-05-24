import type { RecipeRowDraft, FoodCostResult, ServiceType } from '@/types'

export type { ServiceType }

export const FC_TARGET = 35

/**
 * حساب تكلفة صف واحد من المكونات
 * cost = qty / (yieldPct/100) × unitCost
 */
export function calcRowCost(qty: number, yieldPct: number, unitCost: number): number {
  if (yieldPct <= 0) return 0
  return (qty / (yieldPct / 100)) * unitCost
}

/**
 * الحساب الكامل لـ Food Cost لمجموعة من الصفوف
 */
export function calcFoodCost(
  rows: RecipeRowDraft[],
  yieldPortions: number,
  sellPrice: number,
  appPrice: number | null = null
): FoodCostResult {
  return calcServiceCost(rows, [], yieldPortions, sellPrice, appPrice)
}

/**
 * حساب Food Cost لنوع خدمة واحد (Dine In أو Dine Out).
 * foodRows: المكونات الغذائية المشتركة بين النوعين.
 * packagingRows: مكونات التغليف الخاصة بهذا النوع فقط.
 */
export function calcServiceCost(
  foodRows: RecipeRowDraft[],
  packagingRows: RecipeRowDraft[],
  yieldPortions: number,
  sellPrice: number,
  appPrice: number | null = null,
): FoodCostResult {
  const allRows = [...foodRows, ...packagingRows]
  const totalCost = allRows.reduce(
    (sum, r) => sum + calcRowCost(r.qty, r.yield_pct, r.unit_cost),
    0,
  )
  const portions = Math.max(yieldPortions, 1)
  const perPortionCost = totalCost / portions
  const sellPriceExVat = sellPrice / 1.15
  const appPriceExVat = appPrice != null ? appPrice / 1.15 : null
  const foodCostPct = sellPriceExVat > 0 ? (perPortionCost / sellPriceExVat) * 100 : 0
  const margin = sellPriceExVat - perPortionCost
  const marginApp = appPriceExVat != null ? appPriceExVat - perPortionCost : null

  return { totalCost, perPortionCost, foodCostPct, margin, marginApp }
}

/**
 * السعر المقترح لتحقيق هدف FC%
 */
export function calcSuggestedPrice(perPortionCost: number, targetFC = FC_TARGET): number {
  if (targetFC <= 0) return 0
  return perPortionCost / (targetFC / 100)
}

/** تصنيف اللون بناءً على FC% */
export function fcColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct <= FC_TARGET) return 'green'
  if (pct <= 45) return 'yellow'
  return 'red'
}

/** تنسيق رقم بعملة */
export function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}
