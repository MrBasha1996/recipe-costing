import { describe, it, expect } from 'vitest'
import { calcRowCost, calcDeduction, calcFoodCost, calcServiceCost, calcSuggestedPrice, VAT_RATE } from '@/lib/calculations'

describe('calcRowCost', () => {
  it('yield=100%: cost = qty × unitCost', () => {
    expect(calcRowCost(1, 100, 10)).toBe(10)
  })

  it('yield=50%: cost doubles (gross qty doubles)', () => {
    expect(calcRowCost(1, 50, 10)).toBe(20)
  })

  it('yield=0: returns 0 (مكوّن معطّل)', () => {
    expect(calcRowCost(1, 0, 10)).toBe(0)
  })

  it('qty=0: returns 0', () => {
    expect(calcRowCost(0, 100, 10)).toBe(0)
  })

  it('negative yieldPct: returns 0', () => {
    expect(calcRowCost(1, -10, 10)).toBe(0)
  })
})

describe('calcDeduction', () => {
  it('وصفة حصة واحدة: يخصم الكمية الكاملة × عدد المبيعات', () => {
    // qty=0.1kg, yield=100%, yieldPortions=1, qtySold=5 → deduct 0.5kg
    expect(calcDeduction(0.1, 100, 1, 5)).toBeCloseTo(0.5)
  })

  it('وصفة 4 حصص: يُقسّم المكوّن على الحصص', () => {
    // qty=0.4kg, yield=100%, yieldPortions=4, qtySold=1 → 0.4/1/4 × 1 = 0.1
    expect(calcDeduction(0.4, 100, 4, 1)).toBeCloseTo(0.1)
  })

  it('unit conversion factor: يُطبَّق على الخصم', () => {
    // qty=1000g, yield=100%, yieldPortions=1, qtySold=1, factor=1000 (g→kg) → 1kg
    expect(calcDeduction(1000, 100, 1, 1, 1000)).toBeCloseTo(1)
  })

  it('yield_pct=0: يُرجع 0', () => {
    expect(calcDeduction(1, 0, 1, 10)).toBe(0)
  })

  it('yieldPortions أقل من 1: يُعامَل كـ 1 (لا قسمة على صفر)', () => {
    expect(calcDeduction(1, 100, 0, 1)).toBeCloseTo(1)
  })
})

// ── مساعد: صف مكوّن بسيط ─────────────────────────────────────────────
const row = (qty: number, yieldPct: number, unitCost: number) => ({ qty, yield_pct: yieldPct, unit_cost: unitCost } as any)

describe('calcFoodCost', () => {
  it('حساب أساسي: تكلفة + سعر شامل VAT', () => {
    // صف واحد: 1kg × 100% yield × 10 ريال = تكلفة 10
    // سعر البيع 115 ريال (شامل VAT) → سعر بدون VAT = 100 → FC% = 10/100 = 10%
    const r = calcFoodCost([row(1, 100, 10)], 1, 115)
    expect(r.totalCost).toBeCloseTo(10)
    expect(r.perPortionCost).toBeCloseTo(10)
    expect(r.foodCostPct).toBeCloseTo(10)
    expect(r.margin).toBeCloseTo(90)
  })

  it('yieldPortions=0: يُعامَل كـ 1 (لا قسمة على صفر)', () => {
    const r = calcFoodCost([row(1, 100, 10)], 0, 115)
    expect(r.perPortionCost).toBeCloseTo(10)
  })

  it('appPrice موجود: يُحسب marginApp بعد خصم VAT', () => {
    // appPrice = 230 ريال → بدون VAT = 200 → margin = 200 - 10 = 190
    const r = calcFoodCost([row(1, 100, 10)], 1, 115, 230)
    expect(r.marginApp).toBeCloseTo(190)
  })

  it('appPrice=null: marginApp تُرجع null', () => {
    const r = calcFoodCost([row(1, 100, 10)], 1, 115, null)
    expect(r.marginApp).toBeNull()
  })

  it('sellPrice=0: foodCostPct=0 (لا قسمة على صفر)', () => {
    const r = calcFoodCost([row(1, 100, 10)], 1, 0)
    expect(r.foodCostPct).toBe(0)
  })

  it('صفوف متعددة: تجمع تكاليفها', () => {
    // صفان: تكلفة 10 + 20 = 30
    const r = calcFoodCost([row(1, 100, 10), row(1, 100, 20)], 1, 115)
    expect(r.totalCost).toBeCloseTo(30)
  })
})

describe('calcServiceCost', () => {
  it('يدمج foodRows + packagingRows في التكلفة الكلية', () => {
    const r = calcServiceCost([row(1, 100, 10)], [row(1, 100, 5)], 1, 115)
    expect(r.totalCost).toBeCloseTo(15)
    expect(r.foodCostPct).toBeCloseTo(15 / (115 / VAT_RATE) * 100)
  })

  it('packagingRows فارغة: يتصرف كـ calcFoodCost', () => {
    const r1 = calcServiceCost([row(1, 100, 10)], [], 1, 115)
    const r2 = calcFoodCost([row(1, 100, 10)], 1, 115)
    expect(r1.totalCost).toBeCloseTo(r2.totalCost)
    expect(r1.foodCostPct).toBeCloseTo(r2.foodCostPct)
  })

  it('حصتان: perPortionCost = totalCost / 2', () => {
    const r = calcServiceCost([row(1, 100, 20)], [], 2, 115)
    expect(r.perPortionCost).toBeCloseTo(10)
  })
})

describe('calcSuggestedPrice', () => {
  it('هدف 35%: السعر = تكلفة ÷ 0.35', () => {
    // تكلفة 35 ريال → سعر مقترح = 100
    expect(calcSuggestedPrice(35, 35)).toBeCloseTo(100)
  })

  it('هدف 30%: السعر = تكلفة ÷ 0.30', () => {
    expect(calcSuggestedPrice(30, 30)).toBeCloseTo(100)
  })

  it('تكلفة=0: السعر=0', () => {
    expect(calcSuggestedPrice(0, 35)).toBe(0)
  })

  it('هدف=0: يُرجع 0 (لا قسمة على صفر)', () => {
    expect(calcSuggestedPrice(35, 0)).toBe(0)
  })

  it('VAT مُضمَّن: السعر قبل VAT × 1.15 = السعر المعروض', () => {
    // تكلفة الحصة = 10، هدف FC% = 10% → سعر بدون VAT = 100 → مع VAT = 115
    const priceExVat = calcSuggestedPrice(10, 10)
    expect(priceExVat * VAT_RATE).toBeCloseTo(115)
  })
})
