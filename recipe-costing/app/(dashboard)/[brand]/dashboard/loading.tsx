export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-48 bg-gray-100 animate-pulse rounded-lg" />
      <div className="h-9 w-60 bg-gray-100 animate-pulse rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-gray-100 animate-pulse rounded-xl h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-gray-100 animate-pulse rounded-xl h-48" />
        <div className="bg-gray-100 animate-pulse rounded-xl h-48" />
      </div>
    </div>
  )
}
