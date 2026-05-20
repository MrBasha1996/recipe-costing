import { FC_TARGET } from '@/lib/calculations'

interface Props {
  avgFC: number
  overTargetCount: number
  totalRecipes: number
  avgMargin: number
}

export default function KPICards({ avgFC, overTargetCount, totalRecipes, avgMargin }: Props) {
  const fcColor = avgFC <= FC_TARGET ? 'text-green-600' : avgFC <= 45 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        icon="📋"
        iconBg="bg-blue-50"
        label="وصفات محفوظة"
        value={String(totalRecipes)}
        color="text-gray-900"
      />
      <Card
        icon="📊"
        iconBg="bg-green-50"
        label="متوسط Food Cost %"
        value={`${avgFC.toFixed(1)}%`}
        color={fcColor}
        sub={totalRecipes === 0 ? '' : avgFC > FC_TARGET ? 'فوق الهدف' : 'ضمن الهدف'}
      />
      <Card
        icon="⚠"
        iconBg="bg-red-50"
        label={`فوق الهدف (${FC_TARGET}%)`}
        value={String(overTargetCount)}
        color={overTargetCount > 0 ? 'text-red-600' : 'text-green-600'}
        sub={totalRecipes > 0 ? `${((overTargetCount / totalRecipes) * 100).toFixed(0)}% من الوصفات` : ''}
      />
      <Card
        icon="💰"
        iconBg="bg-amber-50"
        label="متوسط هامش الربح"
        value={`${avgMargin.toFixed(2)} ر.س`}
        color={avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}
      />
    </div>
  )
}

function Card({
  icon, iconBg, label, value, color, sub,
}: {
  icon: string; iconBg: string; label: string; value: string; color: string; sub?: string
}) {
  return (
    <div className="stat-card bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-gray-500 text-xs">{label}</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0 text-lg`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
