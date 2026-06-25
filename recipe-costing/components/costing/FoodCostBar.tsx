import { FC_TARGET } from '@/lib/calculations'

interface Props {
  pct: number
}

export default function FoodCostBar({ pct }: Props) {
  const capped = Math.min(pct, 100)
  const color = pct <= FC_TARGET ? 'bg-green-500' : pct <= 45 ? 'bg-yellow-500' : 'bg-red-500'
  const textColor = pct <= FC_TARGET ? 'text-green-600' : pct <= 45 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Food Cost %</span>
        <span className={`font-mono font-bold text-base ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${capped}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-700">
        <span>0%</span>
        <span className="text-gray-600">هدف {FC_TARGET}%</span>
        <span>100%</span>
      </div>
    </div>
  )
}
