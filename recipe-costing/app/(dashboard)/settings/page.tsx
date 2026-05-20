'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import PeriodManager from '@/components/costing/PeriodManager'
import { usePeriod } from '@/hooks/usePeriod'
import { formatYearMonth } from '@/lib/period'

export default function SettingsPage() {
  const { isAccountant } = useUserStore()
  const [showPeriodManager, setShowPeriodManager] = useState(false)
  const { isCurrentClosed, currentYM, closedPeriods, reload } = usePeriod()

  if (!isAccountant()) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-400 text-sm">غير مصرح لك بعرض هذه الصفحة</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-gray-500 text-sm mt-0.5">إعدادات على مستوى الشركة</p>
      </div>

      {/* Period Closing */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔒</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">إقفال الفترات الشهرية</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                على مستوى الشركة — يؤثر على جميع العلامات التجارية
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Current period status */}
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
            isCurrentClosed
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center gap-2">
              <span>{isCurrentClosed ? '🔒' : '🟢'}</span>
              <div>
                <div className="text-sm font-medium text-gray-800">
                  الفترة الحالية — {formatYearMonth(currentYM)}
                </div>
                <div className={`text-xs ${isCurrentClosed ? 'text-red-600' : 'text-green-600'}`}>
                  {isCurrentClosed ? 'مغلقة — لا يمكن تعديل الوصفات أو الأسعار' : 'مفتوحة'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowPeriodManager(true)}
              className="text-sm px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium"
            >
              إدارة الفترات
            </button>
          </div>

          {/* Last closed periods */}
          {closedPeriods.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">الفترات المغلقة ({closedPeriods.length})</p>
              <div className="space-y-1">
                {closedPeriods.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span>🔒</span>
                      {formatYearMonth(p.year_month)}
                    </span>
                    <span className="text-gray-400 font-mono">
                      {new Date(p.closed_at).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                ))}
                {closedPeriods.length > 5 && (
                  <button
                    onClick={() => setShowPeriodManager(true)}
                    className="text-xs text-blue-500 hover:text-blue-700 px-3"
                  >
                    عرض الكل ({closedPeriods.length})...
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showPeriodManager && (
        <PeriodManager onClose={() => { setShowPeriodManager(false); reload() }} />
      )}
    </div>
  )
}
