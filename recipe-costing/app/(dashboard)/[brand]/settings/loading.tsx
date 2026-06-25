export default function Loading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-32" />
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="h-5 bg-gray-200 rounded w-48" />
          </div>
          <div className="px-6 py-6">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
