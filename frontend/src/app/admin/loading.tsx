export default function DashboardLoading() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-white/5 rounded-lg" />
          <div className="h-4 w-32 bg-white/5 rounded-lg mt-2" />
        </div>
        <div className="h-10 w-32 bg-white/5 rounded-lg" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="h-4 w-24 bg-white/5 rounded mb-3" />
            <div className="h-8 w-20 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="h-5 w-40 bg-white/5 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-24 bg-white/5 rounded" />
              <div className="h-4 w-32 bg-white/5 rounded" />
              <div className="h-4 w-20 bg-white/5 rounded" />
              <div className="h-4 flex-1 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
