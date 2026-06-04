import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Recipe Costing — نظام تكاليف الوصفات',
  description: 'نظام تكاليف الوصفات — Three In & باب البلد',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar-u-nu-latn" dir="rtl" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }} suppressHydrationWarning>{children}</body>
    </html>
  )
}
