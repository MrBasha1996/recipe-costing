'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center p-6" style={{ background: '#fafbfc' }}>
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">حدث خطأ</h2>
        <p className="text-gray-500 text-sm mb-1">{error.message}</p>
        {error.digest && (
          <p className="text-gray-400 text-xs font-mono mb-4">Digest: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center mt-5">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/login"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            تسجيل الدخول من جديد
          </Link>
        </div>
      </div>
    </div>
  )
}
