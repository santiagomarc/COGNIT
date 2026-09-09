/**
 * Deck-detail skeleton (design system §9.4).
 *
 * This was the last skeleton still drawing the pre-redesign page: a
 * `rounded-2xl bg-card/40 backdrop-blur-md` header block, a second translucent
 * panel, and a six-up grid of `h-56 rounded-2xl` card tiles. The page it stands
 * in for has been a telemetry strip over a 3px mastery rule, two side-by-side
 * session forms and a row-based card list since Phase 7 — so every element
 * moved when the content landed.
 *
 * It renders inside the shell, so the rail and header are already on screen and
 * are not drawn again here, and it carries no bottom padding: the dashboard
 * route layout owns that (F-03).
 */
export default function DeckDetailLoading() {
  return (
    <div className="container mx-auto space-y-8 p-6 md:p-8">
      {/* Header: share control, title, five readings, mastery rule */}
      <header className="space-y-4">
        <div className="flex items-center justify-end">
          <div className="glass-skeleton h-[34px] w-24 rounded-[var(--radius-control)]" />
        </div>

        <div className="space-y-3">
          <div className="glass-skeleton h-8 w-72 max-w-full rounded-sm" />
          <div className="glass-skeleton h-4 w-96 max-w-full rounded-sm" />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="flex items-baseline gap-2">
              <div className="glass-skeleton h-3 w-14 rounded-sm" />
              <div className="glass-skeleton h-3.5 w-10 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="h-[3px] w-full bg-border" />
      </header>

      {/* Two session forms, side by side above `lg` */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={idx} className="surface space-y-5 p-5">
            <div className="glass-skeleton h-3 w-24 rounded-sm" />
            <div className="glass-skeleton h-5 w-44 rounded-sm" />
            <div className="glass-skeleton h-[34px] w-full rounded-[var(--radius-control)]" />
            <div className="glass-skeleton h-[34px] w-40 rounded-[var(--radius-control)]" />
          </div>
        ))}
      </div>

      {/* Card list — rows with a leading tick, not tiles */}
      <div className="space-y-4">
        <div className="glass-skeleton h-3 w-28 rounded-sm" />
        <div className="border-t border-border">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-3 border-b border-border py-3">
              <div className="glass-skeleton h-4 w-[2px]" />
              <div className="glass-skeleton h-4 flex-1 rounded-sm" />
              <div className="glass-skeleton h-4 w-16 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
