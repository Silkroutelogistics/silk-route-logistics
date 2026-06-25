export default function CarrierDashboardLoading() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-56 bg-[#F5EEE0] rounded-lg" />
          <div className="h-4 w-36 bg-[#F5EEE0] rounded-lg mt-2" />
        </div>
        <div className="h-10 w-28 bg-[#F5EEE0] rounded-lg" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#F5EEE0] border border-[#EFE6D3] rounded-xl p-5">
            <div className="h-4 w-24 bg-[#F5EEE0] rounded mb-3" />
            <div className="h-8 w-20 bg-[#F5EEE0] rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="bg-[#F5EEE0] border border-[#EFE6D3] rounded-xl p-5">
        <div className="h-5 w-40 bg-[#F5EEE0] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-28 bg-[#F5EEE0] rounded" />
              <div className="h-4 w-36 bg-[#F5EEE0] rounded" />
              <div className="h-4 flex-1 bg-[#F5EEE0] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
