import type { intervalBands } from '@/lib/analytics';

type Band = ReturnType<typeof intervalBands>[number];

type FlashcardProgressProps = {
  bands: Band[];
};

export function FlashcardProgress({
  bands,
}: FlashcardProgressProps) {
  const count = (keys: Band['band'][]) =>
    bands
      .filter((band) => keys.includes(band.band))
      .reduce((sum, band) => sum + band.cards, 0);

  const categories = [
    {
      label: 'New',
      cards: count(['new']),
      color: 'var(--border-strong)',
      description: 'Flashcards not yet studied',
    },
    {
      label: 'Learning',
      cards: count(['learning']),
      color: '#E8AD91',
      description: 'Cards in learning or relearning',
    },
    {
      label: 'Regular reviews',
      cards: count(['1-6d', '7-29d']),
      color: 'var(--state-due)',
      description: 'Review intervals of 1 to 29 days',
    },
    {
      label: 'Longer intervals',
      cards: count(['30-89d', '90d+']),
      color: 'var(--ink-dim)',
      description: 'Review intervals of 30 days or more',
    },
  ];

  const total = categories.reduce(
    (sum, category) => sum + category.cards,
    0
  );

  let offset = 0;

  const segments = categories.map((category) => {
    const share =
      total > 0
        ? (category.cards / total) * 100
        : 0;

    const segment = {
      ...category,
      share,
      offset,
    };

    offset += share;

    return segment;
  });

  return (
    <section
      className="surface spec min-w-0 px-4 py-3"
      aria-labelledby="progress-heading"
    >
      <h2
        id="progress-heading"
        className="font-serif text-[22px] leading-none text-ink"
      >
        Flashcard Progress
      </h2>

      <p className="mt-1 text-xs leading-snug text-ink-dim">
        Understand where your flashcards are
        in the review cycle.
      </p>

      {total === 0 ? (
        <p className="py-6 text-center text-xs text-ink-dim">
          Add flashcards to track your progress.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">

          {/* Donut */}
          <div className="mx-auto shrink-0">
            <svg
              viewBox="0 0 120 120"
              className="block h-[92px] w-[92px]"
              role="img"
              aria-label={`Review interval distribution of ${total} flashcards`}
            >
              <circle
                cx={60}
                cy={60}
                r={48}
                fill="none"
                stroke="var(--border)"
                strokeWidth={14}
              />

              {segments.map((segment) =>
                segment.share > 0 ? (
                  <circle
                    key={segment.label}
                    cx={60}
                    cy={60}
                    r={48}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={14}
                    pathLength={100}
                    strokeDasharray={`${segment.share} ${100 - segment.share}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 60 60)"
                  >
                    <title>
                      {`${segment.label}: ${segment.cards} cards (${Math.round(segment.share)}%)`}
                    </title>
                  </circle>
                ) : null
              )}

              <text
                x={60}
                y={55}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={23}
                fontWeight={600}
                fill="var(--ink)"
                >
                {total}
              </text>

              <text
                x={60}
                y={70}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-dim)"
              >
                Total
              </text>

              <text
                x={60}
                y={81}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-dim)"
              >
                cards
              </text>
            </svg>
          </div>

          {/* Legend */}
          <ul className="min-w-[145px] flex-1 space-y-2">
            {segments.map((segment) => (
              <li
                key={segment.label}
                className="flex items-center gap-1.5"
                title={segment.description}
              >
                <span
                  className="size-[8px] shrink-0 rounded-full"
                  style={{
                    backgroundColor: segment.color,
                  }}
                  aria-hidden="true"
                />

                <span className="min-w-0 flex-1 text-[11px] font-medium leading-tight text-ink">
                  {segment.label}
                </span>

                <span className="shrink-0 text-right text-[11px] tnum text-ink">
                  <span className="font-semibold">
                    {segment.cards}
                  </span>
                  {' '}
                  <span className="text-ink-dim">
                    ({Math.round(segment.share)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}