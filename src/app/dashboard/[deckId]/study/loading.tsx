export default function StudyLoading() {
  return (
    <div className="container mx-auto space-y-6 p-6 md:p-8 pb-28">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="glass-skeleton h-4 w-28 rounded" />
        <div className="glass-skeleton h-4 w-36 rounded" />
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="glass-skeleton h-4 w-16 rounded" />
          <div className="glass-skeleton h-4 w-8 rounded" />
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
              <div className="glass-skeleton h-1.5 w-1.5 rounded-full" />
              <div className="glass-skeleton h-3 w-16 rounded" />
            </div>
            <div className="space-y-2">
              <div className="glass-skeleton h-5 w-4/5 rounded" />
              <div className="glass-skeleton h-5 w-3/5 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action hint */}
      <div className="glass-skeleton mx-auto h-4 w-48 rounded" />
    </div>
  );
}
