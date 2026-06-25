const sarFormatter = new Intl.NumberFormat('ar-SA', {
  style: 'currency',
  currency: 'SAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatSAR(n: number): string {
  return sarFormatter.format(n)
}
