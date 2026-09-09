/**
 * The dashboard skeleton, shaped like what actually arrives: a telemetry strip,
 * the due-now band, the deck index and the panels below it. A skeleton in the
 * old two-tile layout would have re-introduced the layout shift on load that
 * the rest of this redesign removes.
 *
 * `pb-28` is gone from here for the same reason it left `dashboard/page.tsx`:
 * the layout already applies it, and the two were nesting (defect F-03).
 */
export default function DashboardLoading() {
  return (
    <div className="container mx-auto space-y-8 p-6 md:p-8">
      {/* Telemetry strip */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex items-baseline gap-2">
                <div className="glass-skeleton h-3 w-16 rounded-sm" />
                <div className="glass-skeleton h-3.5 w-8 rounded-sm" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="glass-skeleton h-[34px] w-28 rounded-sm" />
            <div className="glass-skeleton h-[34px] w-[34px] rounded-sm" />
          </div>
        </div>
        <div className="h-px w-full bg-border" />
      </div>

      {/* Due-now band */}
      <div className="surface p-6 md:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="glass-skeleton h-3 w-16 rounded-sm" />
            <div className="glass-skeleton h-[52px] w-24 rounded-sm" />
            <div className="glass-skeleton h-4 w-64 rounded-sm" />
          </div>
          <div className="flex gap-2">
            <div className="glass-skeleton h-[34px] w-36 rounded-sm" />
            <div className="glass-skeleton h-[34px] w-28 rounded-sm" />
            <div className="glass-skeleton h-[34px] w-28 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Deck index */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="glass-skeleton h-3 w-20 rounded-sm" />
          <div className="glass-skeleton h-[34px] w-72 rounded-sm" />
        </div>
        <div className="border-t border-border">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-3 border-b border-border py-2.5">
              <div className="glass-skeleton h-4 w-[2px]" />
              <div className="glass-skeleton h-4 flex-1 rounded-sm" />
              <div className="glass-skeleton h-4 w-12 rounded-sm" />
              <div className="glass-skeleton h-4 w-12 rounded-sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Forecast */}
      <div className="surface p-5 md:p-6">
        <div className="glass-skeleton h-3 w-32 rounded-sm" />
        <div className="mt-5 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className="glass-skeleton h-[92px] rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
