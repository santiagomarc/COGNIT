type DeckReadingsProps = {
  totalCards: number;
  dueCount: number;
  learningCount: number;
  scheduledCount: number;
  newCount: number;
  masteredCards: number;
  masteryPercentage: number;
  topTopics: Array<[string, number]>;
};

type Segment = {
  key: string;
  label: string;
  count: number;
  color: string;
};

/**
 * The deck's scheduler state, as a form rather than a list (Run 6, Task 3.4).
 *
 * Part-to-whole, so one stacked bar. The separator between segments is a 2px
 * gap in the surface colour, never a stroke drawn around each one — a border
 * here would be data-weight ink that is not data.
 *
 * Every segment is paired with its word *and* its count in the legend below.
 * That is not politeness: the state channel's due/learning pair measures
 * ΔE 0.6 under deuteranopia in light mode, so §2.3's "colour is never the only
 * carrier" is the only thing keeping this readable. Do not reduce it to ticks.
 *
 * A zero-count segment does not render at all — a labelled slice of nothing is
 * worse than an absence.
 */
export function DeckReadings({
  totalCards,
  dueCount,
  learningCount,
  scheduledCount,
  newCount,
  masteredCards,
  masteryPercentage,
  topTopics,
}: DeckReadingsProps) {
  const segments: Segment[] = [
    { key: 'due', label: 'Due', count: dueCount, color: 'var(--state-due)' },
    { key: 'learning', label: 'Learning', count: learningCount, color: 'var(--state-learning)' },
    { key: 'scheduled', label: 'Scheduled', count: scheduledCount, color: 'var(--ink-dim)' },
    { key: 'new', label: 'New', count: newCount, color: 'var(--border-strong)' },
  ].filter((segment) => segment.count > 0);

  const denominator = Math.max(1, totalCards);

  return (
    <section className="surface spec flex flex-col items-stretch p-4 lg:flex-row lg:px-5 lg:py-4">
      {/* ── Scheduler state ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pr-[22px]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Scheduler state
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
            {totalCards} cards
          </p>
        </div>

        {segments.length > 0 ? (
          <>
            <div className="mt-3.5 flex h-[22px] gap-[2px]" aria-hidden="true">
              {segments.map((segment, index) => (
                <span
                  key={segment.key}
                  className="block"
                  style={{
                    width: `${(segment.count / denominator) * 100}%`,
                    backgroundColor: segment.color,
                    borderTopLeftRadius: index === 0 ? 3 : 0,
                    borderBottomLeftRadius: index === 0 ? 3 : 0,
                    borderTopRightRadius: index === segments.length - 1 ? 3 : 0,
                    borderBottomRightRadius: index === segments.length - 1 ? 3 : 0,
                  }}
                />
              ))}
            </div>

            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {segments.map((segment) => (
                <li key={segment.key} className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="block h-[10px] w-[2px] rounded-[1px]"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="text-xs text-ink-dim">{segment.label}</span>
                  <span className="font-mono text-xs tnum text-ink">{segment.count}</span>
                </li>
              ))}
              <li className="inline-flex items-center gap-2">
                <span className="text-xs text-ink-dimmer">Proven in quiz</span>
                <span className="font-mono text-xs tnum text-ink">{masteredCards}</span>
              </li>
            </ul>
          </>
        ) : (
          <p className="mt-3.5 text-sm text-ink-dim">
            No cards yet. Add some to start the scheduler.
          </p>
        )}

        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Mastery
            </span>
            <span className="font-mono text-xs tnum text-ink-dim">{masteryPercentage}%</span>
          </div>
          <span
            aria-hidden="true"
            className="mt-2 block h-[3px] w-full overflow-hidden rounded-[1px] bg-border-strong"
          >
            <span
              className="block h-full"
              style={{
                width: `${Math.min(masteryPercentage, 100)}%`,
                backgroundColor:
                  masteryPercentage >= 70 ? 'var(--state-mastered)' : 'var(--ink-dim)',
              }}
            />
          </span>
        </div>
      </div>

      {topTopics.length > 0 ? (
        <>
          <div className="rule rule--soft my-4 lg:hidden" aria-hidden="true" />
          <div className="rule--v max-lg:hidden" aria-hidden="true" />

          {/* ── Top concepts ─────────────────────────────────────────── */}
          <div className="flex flex-col lg:w-[300px] lg:shrink-0 lg:pl-[22px]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Top concepts
              </h2>
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                AI topic tags
              </p>
            </div>

            {/* A count is a better badge than a tint (§6), and a topic is not an
                SM-2 state, so it gets no colour at all. */}
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {topTopics.slice(0, 8).map(([topic, count]) => (
                <li key={topic} className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-ink">{topic}</span>
                  <span className="font-mono text-xs tnum text-ink-dimmer">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}
