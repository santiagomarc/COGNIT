import type { retrievabilityHistogram } from '@/lib/analytics';

type Bar = ReturnType<typeof retrievabilityHistogram>[number];

/**
 * The forgetting-curve forecast (improvement plan §4.1): ten bars of
 * predicted recall, right now, over every review-state card. Bars below
 * 80 % take `--state-due` — that IS a state (these cards are about to be
 * due) — the rest stay ink. A server-rendered SVG; no chart library.
 */
export function RetrievabilityHistogram({ bars }: { bars: Bar[] }) {
  const peak = Math.max(1, ...bars.map((bar) => bar.cards));
  const width = 400;
  const height = 120;
  const gap = 6;
  const barWidth = (width - gap * (bars.length - 1)) / bars.length;
  const total = bars.reduce((sum, bar) => sum + bar.cards, 0);

  if (total === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        No reviewed cards yet — the curve appears once cards reach the review state.
      </p>
    );
  }

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Predicted recall of ${total} reviewed cards, in ten bands from 0 to 100 percent.`}
      >
        {bars.map((bar, index) => {
          const barHeight = bar.cards === 0 ? 2 : Math.max(3, (bar.cards / peak) * height);
          const x = index * (barWidth + gap);
          return (
            <g key={bar.bucket}>
              <rect
                x={x}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                rx={2}
                fill={bar.cards === 0 ? 'var(--border)' : bar.atRisk ? 'var(--state-due)' : 'var(--ink-dim)'}
              >
                <title>{`${bar.label}: ${bar.cards} ${bar.cards === 1 ? 'card' : 'cards'}`}</title>
              </rect>
              {index % 3 === 0 || index === bars.length - 1 ? (
                <text
                  x={x + barWidth / 2}
                  y={height + 13}
                  textAnchor="middle"
                  className="fill-[var(--ink-dimmer)] font-mono text-[9px] uppercase tracking-[0.12em]"
                >
                  {bar.label.split('–')[0]}%
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-center gap-4 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-due)]" aria-hidden="true" />
          Below 80% · likely to lapse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--ink-dim)]" aria-hidden="true" />
          Holding
        </span>
      </figcaption>
    </figure>
  );
}
