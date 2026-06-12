export function getCurrentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('ar-SA', {
    month: 'long', year: 'numeric',
  })
}

/**
 * Returns the valid date range for a given YYYY-MM month.
 * Handles months with 28/29/30/31 days correctly.
 */
export function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number)
  const lastDay = new Date(year, m, 0).getDate() // day 0 of next month = last day of this month
  return {
    start: `${month}-01`,
    end:   `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Shifts a YYYY-MM string by delta months (negative = backward) */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns last N year-month strings, newest first */
export function lastNMonths(n: number): string[] {
  const result: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return result
}
