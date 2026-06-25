export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="h-8 w-56 bg-gray-100 animate-pulse rounded-lg" />
      <div className="h-40 bg-gray-100 animate-pulse rounded-xl border-2 border-dashed border-gray-200" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
