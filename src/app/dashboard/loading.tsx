export default function DashboardLoading() {
  return (
    <div className="container mx-auto p-6 md:p-8 pb-28 space-y-8">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="glass-skeleton h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <div className="glass-skeleton h-7 w-40 rounded-lg" />
            <div className="glass-skeleton h-4 w-56 rounded-lg" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-skeleton h-9 w-28 rounded-lg" />
          <div className="glass-skeleton h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Due Today skeleton */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="glass-skeleton h-11 w-11 rounded-xl" />
            <div className="space-y-2 flex-1">
              <div className="glass-skeleton h-3 w-16 rounded" />
              <div className="glass-skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="glass-skeleton h-10 w-full rounded-lg" />
            <div className="glass-skeleton h-10 w-full rounded-lg" />
          </div>
        </div>

        {/* Streak skeleton */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="glass-skeleton h-11 w-11 rounded-xl" />
            <div className="space-y-2 flex-1">
              <div className="glass-skeleton h-3 w-20 rounded" />
              <div className="glass-skeleton h-8 w-14 rounded-lg" />
            </div>
          </div>
          <div className="glass-skeleton mt-4 h-10 w-full rounded-lg" />
        </div>
      </div>

      {/* Search skeleton */}
      <div className="glass-skeleton h-10 w-full max-w-sm rounded-xl" />

      {/* Deck grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="glass-card rounded-2xl p-6"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className="space-y-3">
              <div className="glass-skeleton h-5 w-3/4 rounded-lg" />
              <div className="flex items-center gap-2">
                <div className="glass-skeleton h-3 w-20 rounded" />
                <div className="glass-skeleton h-4 w-14 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
