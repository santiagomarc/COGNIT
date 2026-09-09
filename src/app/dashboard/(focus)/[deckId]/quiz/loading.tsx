/**
 * Quiz skeleton (design system §9.4).
 *
 * Shaped like `QuizAssessmentClient` renders: same container and padding, the
 * telemetry row and its 1px rule, then the question card with four options at
 * the real `.opt` height. The old skeleton drew a two-column
 * translucent `rounded-2xl` panel grid that the rebuilt page does not have.
 */
export default function QuizLoading() {
  return (
    <div className="container mx-auto p-6 md:p-8">
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="glass-skeleton h-[30px] w-28 rounded-[var(--radius-control)]" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-baseline gap-2">
                  <div className="glass-skeleton h-3 w-12 rounded-sm" />
                  <div className="glass-skeleton h-3.5 w-10 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-px w-full bg-border" />
        </header>

        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div className="glass-skeleton min-h-[10rem] rounded-[var(--radius-container)]" />

          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="glass-skeleton h-11 rounded-[var(--radius-control)]"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
