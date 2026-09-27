import Link from 'next/link';
import { topicTone, type TopicMastery } from '@/lib/analytics';

const TONE_COLOR = {
  mastered: 'var(--state-mastered)',
  lapsed: 'var(--state-lapsed)',
  ink: 'var(--ink)',
} as const;

const HEAD = 'py-2 text-right font-mono text-[10px] font-normal uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const CELL = 'py-2.5 text-right font-mono text-[13px] tnum';

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Topic mastery as a real table (plan §5.3, A11Y-06): a screen reader gets
 * column headers for every number, and the headers stay visible on a phone —
 * where Unseen and Ease drop out rather than the meaning of the rest.
 * The row's hue is a state (mastered or lapsing), and only its tick and its
 * one number carry it (§2.2).
 */
export function TopicHeatmap({ topics }: { topics: TopicMastery[] }) {
  if (topics.length === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        Topics appear once enriched cards carry tags — three or more cards per tag.
      </p>
    );
  }

  return (
    <div className="well mt-3 overflow-x-auto px-3.5">
      <table className="w-full border-collapse">
        <caption className="sr-only">Topic mastery: cards, unseen cards, lapse rate, mastered share and mean ease per topic</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={`${HEAD} text-left`}>Topic</th>
            <th scope="col" className={HEAD}>Cards</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>Unseen</th>
            <th scope="col" className={HEAD}>Lapse</th>
            <th scope="col" className={HEAD}>Mastered</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>Ease</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => {
            const tone = topicTone(topic);
            const href = topic.deck_id ? `/dashboard/${topic.deck_id}/study?scope=unmastered_only` : null;
            return (
              <tr key={topic.tag} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-4 w-[2px] shrink-0 rounded-[1px]"
                      style={{ backgroundColor: tone === 'ink' ? 'var(--border-strong)' : TONE_COLOR[tone] }}
                    />
                    {href ? (
                      <Link
                        href={href}
                        className="truncate rounded-[var(--radius-control)] text-sm text-ink underline-offset-[3px] outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        title={`Review unmastered ${topic.tag} cards`}
                      >
                        {topic.tag}
                      </Link>
                    ) : (
                      <span className="truncate text-sm text-ink">{topic.tag}</span>
                    )}
                  </span>
                </th>
                <td className={`${CELL} text-ink-dim`}>{topic.cards}</td>
                <td className={`${CELL} hidden text-ink-dim sm:table-cell`}>{topic.unseen}</td>
                <td className={CELL} style={{ color: tone === 'lapsed' ? TONE_COLOR.lapsed : 'var(--ink-dim)' }}>{pct(topic.lapse_rate)}</td>
                <td className={CELL} style={{ color: tone === 'mastered' ? TONE_COLOR.mastered : 'var(--ink-dim)' }}>{pct(topic.mastered_share)}</td>
                <td className={`${CELL} hidden text-ink-dim sm:table-cell`}>{topic.mean_ease === null ? '—' : topic.mean_ease.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
