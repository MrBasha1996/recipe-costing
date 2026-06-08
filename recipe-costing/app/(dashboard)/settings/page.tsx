'use client'

import { useState, useEffect } from 'react'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { useBrandStore } from '@/stores/brandStore'
import { createClient } from '@/lib/supabase/client'
import PeriodManager from '@/components/costing/PeriodManager'
import { usePeriod } from '@/hooks/usePeriod'
import { formatYearMonth } from '@/lib/period'

export default function SettingsPage() {
  const { hasPermission, isSuperAdmin } = usePermissionsStore()
  const { brand } = useBrandStore()
  const [showPeriodManager, setShowPeriodManager] = useState(false)
  const { isCurrentClosed, currentYM, closedPeriods, reload } = usePeriod()

  const [commissionPct, setCommissionPct] = useState<string>('')
  const [savingCommission, setSavingCommission] = useState(false)
  const [commissionMsg, setCommissionMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [fcLow, setFcLow]   = useState<string>('35')
  const [fcHigh, setFcHigh] = useState<string>('45')
  const [savingFc, setSavingFc] = useState(false)
  const [fcMsg, setFcMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!brand) return
    const supabase = createClient()
    ;(supabase.from('brands') as any)
      .select('delivery_commission_pct, fc_target_low, fc_target_high')
      .eq('id', brand)
      .single()
      .then(({ data }: any) => {
        if (data) {
          setCommissionPct(String(data.delivery_commission_pct ?? 0))
          setFcLow(String(data.fc_target_low ?? 35))
          setFcHigh(String(data.fc_target_high ?? 45))
        }
      })
  }, [brand])

  async function saveFcTargets() {
    const low = parseFloat(fcLow); const high = parseFloat(fcHigh)
    if (isNaN(low) || isNaN(high) || low < 0 || high > 100 || low >= high) {
      setFcMsg({ ok: false, text: 'أدخل نسبًا صحيحة: الحد الأدنى < الحد الأعلى وكلاهما بين 0 و 100' })
      return
    }
    setSavingFc(true); setFcMsg(null)
    const supabase = createClient()
    const { error } = await (supabase.from('brands') as any)
      .update({ fc_target_low: low, fc_target_high: high })
      .eq('id', brand)
    setSavingFc(false)
    setFcMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'تم الحفظ ✓' })
  }

  async function saveCommission() {
    const pct = parseFloat(commissionPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setCommissionMsg({ ok: false, text: 'أدخل نسبة صحيحة بين 0 و 100' })
      return
    }
    setSavingCommission(true)
    setCommissionMsg(null)
    const supabase = createClient()
    const { error } = await (supabase.from('brands') as any)
      .update({ delivery_commission_pct: pct })
      .eq('id', brand)
    setSavingCommission(false)
    setCommissionMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'تم الحفظ ✓' })
  }

  if (!isSuperAdmin && !hasPermission('settings', 'view')) {
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

      {/* Delivery Commission */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛵</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">عمولة منصات التوصيل</h2>
              <p className="text-xs text-gray-500 mt-0.5">تُطرح تلقائياً من صافي الربح في تقرير P&L</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-48 shrink-0">نسبة العمولة على الإيراد</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="100" step="0.5"
                value={commissionPct}
                onChange={e => setCommissionPct(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-left font-mono focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <button onClick={saveCommission} disabled={savingCommission || !isSuperAdmin && !hasPermission('settings', 'edit')}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-40 font-medium">
              {savingCommission ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
          {commissionMsg && (
            <p className={`text-xs ${commissionMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{commissionMsg.text}</p>
          )}
          <p className="text-xs text-gray-400">مثال: إذا كانت Jahez تأخذ 20% أدخل 20 — ستُحتسب على إجمالي الإيراد (قبل VAT)</p>
        </div>
      </div>

      {/* FC% Targets */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">أهداف نسبة تكلفة الغذاء (FC%)</h2>
              <p className="text-xs text-gray-500 mt-0.5">تُستخدم في التقارير ولوحة التحكم لتصنيف الأطباق</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 w-28 shrink-0">الحد الأدنى (جيد)</label>
              <input type="number" min="0" max="100" step="0.5" value={fcLow}
                onChange={e => setFcLow(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-left font-mono focus:outline-none focus:border-blue-500" />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 w-28 shrink-0">الحد الأعلى (مقبول)</label>
              <input type="number" min="0" max="100" step="0.5" value={fcHigh}
                onChange={e => setFcHigh(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-left font-mono focus:outline-none focus:border-blue-500" />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <button onClick={saveFcTargets} disabled={savingFc || (!isSuperAdmin && !hasPermission('settings', 'edit'))}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-40 font-medium">
              {savingFc ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
          {fcMsg && (
            <p className={`text-xs ${fcMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{fcMsg.text}</p>
          )}
          <p className="text-xs text-gray-400">
            أقل من {fcLow}% = ممتاز · {fcLow}–{fcHigh}% = مقبول · أعلى من {fcHigh}% = مرتفع
          </p>
        </div>
      </div>

      {showPeriodManager && (
        <PeriodManager onClose={() => { setShowPeriodManager(false); reload() }} />
      )}
    </div>
  )
}
