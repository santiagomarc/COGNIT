export default function DashboardLoading() {
  return (
    <div className="container mx-auto p-6 md:p-8 space-y-8">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/40" />
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-4 w-56 animate-pulse rounded-lg bg-muted/30" />
          </div>
        </div>
        <div className="h-9 w-9 animate-pulse rounded-full bg-muted/40" />
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* Create form skeleton */}
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
          <div className="space-y-1">
            <div className="h-5 w-36 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-4 w-52 animate-pulse rounded-lg bg-muted/30" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted/30" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted/30 border border-primary/10" />
          </div>
          <div className="h-10 w-full animate-pulse rounded-lg bg-primary/20" />
        </div>

        {/* Deck grid skeleton */}
        <div className="col-span-1 md:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="glass-card rounded-2xl p-6"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="space-y-3">
                  <div className="h-5 w-3/4 animate-pulse rounded-lg bg-muted/40" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
