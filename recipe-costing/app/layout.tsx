import type { Metadata, Viewport } from 'next'
import './globals.css'
import SwRegister from '@/components/SwRegister'

export const viewport: Viewport = {
  themeColor: '#0e1f2e',
}

export const metadata: Metadata = {
  title: 'Recipe Costing — نظام تكاليف الوصفات',
  description: 'نظام تكاليف الوصفات — Three In & باب البلد',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'نظام التكاليف',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar-u-nu-latn" dir="rtl" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }} suppressHydrationWarning>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
