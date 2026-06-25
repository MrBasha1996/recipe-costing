'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { usePeriod } from '@/hooks/usePeriod'
import { formatYearMonth, lastNMonths, getCurrentYearMonth } from '@/lib/period'

interface Props {
  onClose: () => void
}

export default function PeriodManager({ onClose }: Props) {
  const { profile } = useUserStore()
  const { closedSet, reload, currentYM, GLOBAL_BRAND } = usePeriod()
  const [closing, setClosing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [confirmYM, setConfirmYM] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const months = lastNMonths(12)

  async function handleClose(ym: string) {
    setClosing(ym)
    setError(null)
    try {
      const supabase = createClient()
      const { error: err } = await (supabase.from('closed_periods') as any).insert({
        brand_id: GLOBAL_BRAND,
        year_month: ym,
        closed_by: profile?.id ?? null,
        note: note.trim() || null,
      })
      if (err) throw err
      setNote('')
      setConfirmYM(null)
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setClosing(null)
    }
  }

  async function handleReopen(ym: string) {
    setClosing(ym)
    setError(null)
    try {
      const supabase = createClient()
      await (supabase.from('closed_periods') as any)
        .delete()
        .eq('brand_id', GLOBAL_BRAND)
        .eq('year_month', ym)
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900">إقفال الفترات الشهرية</h2>
            <p className="text-xs text-gray-500 mt-0.5">على مستوى الشركة — يؤثر على جميع العلامات التجارية</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Current period warning */}
        {closedSet.has(currentYM) && (
          <div className="mx-4 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            <span>🔒</span>
            <span>الفترة الحالية <strong>{formatYearMonth(currentYM)}</strong> مغلقة — لا يمكن حفظ أي وصفة أو سعر</span>
          </div>
        )}

        {/* Months list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {months.map(ym => {
            const isClosed = closedSet.has(ym)
            const isCurrent = ym === currentYM
            const isConfirming = confirmYM === ym
            const isBusy = closing === ym

            return (
              <div
                key={ym}
                className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 border ${
                  isClosed
                    ? 'bg-gray-50 border-gray-200'
                    : isCurrent
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isClosed ? '🔒' : isCurrent ? '📅' : '🟢'}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      {formatYearMonth(ym)}
                      {isCurrent && <span className="mr-1 text-xs text-blue-500">(الحالي)</span>}
                    </div>
                    <div className={`text-xs ${isClosed ? 'text-red-500' : 'text-green-600'}`}>
                      {isClosed ? 'مغلق — للقراءة فقط' : 'مفتوح'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isClosed ? (
                    <button
                      onClick={() => handleReopen(ym)}
                      disabled={isBusy}
                      className="text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isBusy ? '...' : '🔓 إعادة فتح'}
                    </button>
                  ) : isConfirming ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="ملاحظة (اختياري)"
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:border-red-400"
                      />
                      <button
                        onClick={() => handleClose(ym)}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isBusy ? '...' : 'تأكيد الإقفال'}
                      </button>
                      <button
                        onClick={() => setConfirmYM(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmYM(ym)}
                      className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-gray-600 border border-gray-200 rounded-lg transition-colors"
                    >
                      🔒 إقفال الفترة
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          فقط المحاسب يمكنه إقفال وإعادة فتح الفترات
        </div>
      </div>
    </div>
  )
}
