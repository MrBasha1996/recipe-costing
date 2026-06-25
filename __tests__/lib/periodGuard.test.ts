import { describe, it, expect } from 'vitest'
import { isPeriodClosed, monthRange, shiftMonth } from '@/lib/period'

describe('isPeriodClosed', () => {
  it('لا إغلاق (closedUpTo=null): يُرجع false', () => {
    expect(isPeriodClosed('2024-01-15', null)).toBe(false)
  })

  it('لا إغلاق (closedUpTo=undefined): يُرجع false', () => {
    expect(isPeriodClosed('2024-01-15', undefined)).toBe(false)
  })

  it('نفس الشهر المغلق: يُرجع true', () => {
    expect(isPeriodClosed('2024-01-15', '2024-01')).toBe(true)
  })

  it('شهر سابق للمغلق: يُرجع true', () => {
    expect(isPeriodClosed('2023-12-01', '2024-01')).toBe(true)
  })

  it('شهر تالٍ للمغلق: يُرجع false', () => {
    expect(isPeriodClosed('2024-02-01', '2024-01')).toBe(false)
  })

  it('انتقال السنة — ديسمبر بعد إغلاق نوفمبر: false', () => {
    expect(isPeriodClosed('2024-12-01', '2024-11')).toBe(false)
  })

  it('انتقال السنة — يناير بعد إغلاق ديسمبر: false', () => {
    expect(isPeriodClosed('2025-01-01', '2024-12')).toBe(false)
  })

  it('batchDate بتنسيق YYYY-MM: يُقرأ صحيحاً', () => {
    expect(isPeriodClosed('2024-01', '2024-01')).toBe(true)
    expect(isPeriodClosed('2024-02', '2024-01')).toBe(false)
  })
})

describe('monthRange', () => {
  it('يناير: 31 يوم', () => {
    expect(monthRange('2024-01')).toEqual({ start: '2024-01-01', end: '2024-01-31' })
  })

  it('فبراير 2024 (سنة كبيسة): 29 يوم', () => {
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('فبراير 2023 (غير كبيسة): 28 يوم', () => {
    expect(monthRange('2023-02')).toEqual({ start: '2023-02-01', end: '2023-02-28' })
  })

  it('أبريل: 30 يوم', () => {
    expect(monthRange('2024-04')).toEqual({ start: '2024-04-01', end: '2024-04-30' })
  })
})

describe('shiftMonth', () => {
  it('إزاحة +1 شهر', () => {
    expect(shiftMonth('2024-01', 1)).toBe('2024-02')
  })

  it('إزاحة -1 شهر', () => {
    expect(shiftMonth('2024-01', -1)).toBe('2023-12')
  })

  it('انتقال السنة للأمام', () => {
    expect(shiftMonth('2024-12', 1)).toBe('2025-01')
  })

  it('إزاحة +12 = نفس الشهر سنة تالية', () => {
    expect(shiftMonth('2024-01', 12)).toBe('2025-01')
  })
})
