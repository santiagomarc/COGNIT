export default function StudyLoading() {
  return (
    <div className="container mx-auto space-y-6 p-6 md:p-8 pb-28">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-28 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-36 animate-pulse rounded bg-muted/30" />
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-8 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
          <div className="h-full w-0 rounded-full bg-primary/40" />
        </div>
      </div>

      {/* Stacked card skeleton */}
      <div className="relative mx-auto h-[24rem] w-full max-w-2xl">
        <div className="glass-card absolute inset-0 rounded-3xl opacity-40 scale-[0.96] translate-y-2.5" />
        <div className="glass-card glow-border absolute inset-0 rounded-3xl p-7">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted/40" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-4/5 animate-pulse rounded bg-muted/40" />
              <div className="h-5 w-3/5 animate-pulse rounded bg-muted/30" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action hint */}
      <div className="mx-auto h-4 w-48 animate-pulse rounded bg-muted/30" />
    </div>
  );
}
