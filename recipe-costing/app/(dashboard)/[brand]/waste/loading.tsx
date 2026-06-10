export default function Loading() {
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="h-8 w-48 bg-gray-100 animate-pulse rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
