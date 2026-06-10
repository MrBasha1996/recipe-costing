export default function Loading() {
  return (
    <div className="space-y-5 max-w-7xl animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 bg-gray-200 rounded w-48" />
        <div className="flex gap-2">
          <div className="h-9 bg-gray-200 rounded w-24" />
          <div className="h-9 bg-gray-200 rounded w-32" />
        </div>
      </div>
      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-0">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded w-24" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl h-28" />
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl h-72" />
    </div>
  )
}
