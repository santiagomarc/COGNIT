import type { retrievabilityHistogram } from '@/lib/analytics';
import { ChartDataTable } from '@/components/ui/shared/analytics/ChartDataTable';

type Bar = ReturnType<typeof retrievabilityHistogram>[number];

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The forgetting-curve forecast (improvement plan §4.1): ten bars of
 * predicted recall over every review-state card. Bars below 80 % take
 * `--state-due` — that IS a state — the rest stay ink.
 *
 * Geometry stretches with the panel; type does not (plan §5.3, MOB-02). The
 * bars are flex items and the labels are HTML at the 10 px label step, so a
 * phone never gets 7.7 px axis text and a wide panel never gets 25 px. The
 * picture is aria-hidden; the numbers are in a real table.
 */
export function RetrievabilityHistogram({ bars }: { bars: Bar[] }) {
  const peak = Math.max(1, ...bars.map((bar) => bar.cards));
  const total = bars.reduce((sum, bar) => sum + bar.cards, 0);

  if (total === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        No reviewed cards yet — the curve appears once cards reach the review state.
      </p>
    );
  }

  const atRisk = bars.filter((bar) => bar.atRisk).reduce((sum, bar) => sum + bar.cards, 0);

  return (
    <figure className="mt-3">
      <div className="flex h-[120px] items-end gap-[6px]" aria-hidden="true">
        {bars.map((bar) => (
          <span
            key={bar.bucket}
            title={`${bar.label}: ${bar.cards} ${bar.cards === 1 ? 'card' : 'cards'}`}
            className="block flex-1 rounded-t-[2px]"
            style={{
              height: bar.cards === 0 ? '2px' : `${Math.max(3, (bar.cards / peak) * 100)}%`,
              backgroundColor: bar.cards === 0 ? 'var(--border)' : bar.atRisk ? 'var(--state-due)' : 'var(--ink-dim)',
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-[6px]" aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={bar.bucket} className={`flex-1 text-center tnum ${LABEL}`}>
            {index % 3 === 0 || index === bars.length - 1 ? `${bar.label.split('–')[0]}%` : ''}
          </span>
        ))}
      </div>
      <ChartDataTable
        caption={`Predicted recall of ${total} reviewed cards; ${atRisk} below 80 percent.`}
        columns={['Predicted recall', 'Cards']}
        rows={bars.map((bar) => [bar.label, bar.cards])}
      />
      <figcaption className={`mt-1 flex items-center gap-4 ${LABEL}`}>
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
