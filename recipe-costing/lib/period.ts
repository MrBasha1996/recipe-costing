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
