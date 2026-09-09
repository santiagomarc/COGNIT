/**
 * Study skeleton (design system §9.4).
 *
 * Shaped like `FlashcardReviewClient` actually renders: the same container and
 * padding, a telemetry row with a 1px progress rule under it (the old skeleton
 * drew an 8px pill inside a `rounded-2xl` panel — a component that no longer
 * exists), a `--radius-container` card at the real `min-height`, and the four
 * grade keys. Matching the geometry is the point: a skeleton that guesses is a
 * layout shift with extra steps.
 */
export default function StudyLoading() {
  return (
    <div className="container mx-auto p-6 md:p-8">
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="glass-skeleton h-[30px] w-28 rounded-[var(--radius-control)]" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="flex items-baseline gap-2">
                  <div className="glass-skeleton h-3 w-12 rounded-sm" />
                  <div className="glass-skeleton h-3.5 w-10 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
          {/* The progress rule is 1px, like the real one (§4.3). */}
          <div className="h-px w-full bg-border" />
        </header>

        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div className="glass-skeleton min-h-[14rem] rounded-[var(--radius-container)]" />

          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="glass-skeleton h-[62px] rounded-[var(--radius-control)]"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
