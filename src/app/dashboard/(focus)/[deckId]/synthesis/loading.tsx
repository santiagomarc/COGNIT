/**
 * Drill canvas skeleton, shaped like `SynthesisDrillClient` renders: the
 * telemetry header and its rule, a two-line serif prompt, the concepts line,
 * then the four-slot answer form at its real height.
 */
export default function SynthesisLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex-none space-y-3 p-4 md:px-8 md:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="glass-skeleton h-[32px] w-32 rounded-[var(--radius-sm)]" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex items-baseline gap-2">
                <div className="glass-skeleton h-3 w-12 rounded-sm" />
                <div className="glass-skeleton h-3.5 w-10 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-px w-full bg-border" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-8 md:px-8">
        <div className="space-y-2">
          <div className="glass-skeleton h-7 w-full rounded-sm" />
          <div className="glass-skeleton h-7 w-4/5 rounded-sm" />
          <div className="glass-skeleton mt-3 h-3 w-1/2 rounded-sm" />
        </div>
        <div className="glass-skeleton min-h-[20rem] rounded-[var(--radius-lg)]" />
        <div className="flex justify-end gap-2">
          <div className="glass-skeleton h-[40px] w-20 rounded-[var(--radius-sm)]" />
          <div className="glass-skeleton h-[40px] w-28 rounded-[var(--radius-sm)]" />
        </div>
      </main>
    </div>
  );
}
