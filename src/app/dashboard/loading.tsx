export default function DashboardLoading() {
  return (
    <div className="container mx-auto p-6 md:p-8 pb-28 space-y-8">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/40" />
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-4 w-56 animate-pulse rounded-lg bg-muted/30" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/40" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Due Today skeleton */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/40" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
              <div className="h-8 w-20 animate-pulse rounded-lg bg-muted/40" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted/20" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted/20" />
          </div>
        </div>

        {/* Streak skeleton */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/40" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-20 animate-pulse rounded bg-muted/30" />
              <div className="h-8 w-14 animate-pulse rounded-lg bg-muted/40" />
            </div>
          </div>
          <div className="mt-4 h-10 w-full animate-pulse rounded-lg bg-muted/20" />
        </div>
      </div>

      {/* Search skeleton */}
      <div className="h-10 w-full max-w-sm animate-pulse rounded-xl bg-muted/30 border border-primary/10" />

      {/* Deck grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="glass-card rounded-2xl p-6"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className="space-y-3">
              <div className="h-5 w-3/4 animate-pulse rounded-lg bg-muted/40" />
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted/30" />
                <div className="h-4 w-14 animate-pulse rounded-full bg-primary/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
