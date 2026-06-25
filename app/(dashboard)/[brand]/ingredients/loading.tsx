export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-100 animate-pulse rounded-lg" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
