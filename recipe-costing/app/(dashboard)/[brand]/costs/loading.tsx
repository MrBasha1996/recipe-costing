export default function Loading() {
  return (
    <div className="space-y-5 max-w-4xl animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 bg-gray-200 rounded w-40" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-100 rounded-xl p-4 h-20" />
        ))}
      </div>
      <div className="h-10 bg-gray-100 rounded-xl w-80" />
      <div className="bg-white border border-gray-200 rounded-xl h-64" />
    </div>
  )
}
