import Link from 'next/link';
import { topicTone, type TopicMastery } from '@/lib/analytics';

const TONE_COLOR = {
  mastered: 'var(--state-mastered)',
  lapsed: 'var(--state-lapsed)',
  ink: 'var(--ink)',
} as const;

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Topic mastery, one row per tag with at least three cards: unseen, lapse
 * rate, mastered share, mean ease. The row's colour is a state — mastered
 * or lapsing — so hue is allowed there and nowhere else (§2.2). A row links
 * to an unmastered-only session on the deck that holds most of the tag.
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
    <div className="well mt-3 overflow-hidden px-3.5">
      <div className="hidden items-center gap-3 border-b border-border py-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer sm:flex">
        <span className="min-w-0 flex-1">Topic</span>
        <span className="w-12 text-right">Cards</span>
        <span className="w-14 text-right">Unseen</span>
        <span className="w-16 text-right">Lapse</span>
        <span className="w-20 text-right">Mastered</span>
        <span className="w-12 text-right">Ease</span>
      </div>
      <ul>
        {topics.map((topic) => {
          const tone = topicTone(topic);
          const href = topic.deck_id ? `/dashboard/${topic.deck_id}/study?scope=unmastered_only` : null;
          const row = (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-[2px] shrink-0 rounded-[1px]"
                  style={{ backgroundColor: tone === 'ink' ? 'var(--border-strong)' : TONE_COLOR[tone] }}
                />
                <span className="truncate text-sm text-ink">{topic.tag}</span>
              </span>
              <span className="w-12 text-right font-mono text-[13px] tnum text-ink-dim">{topic.cards}</span>
              <span className="hidden w-14 text-right font-mono text-[13px] tnum text-ink-dim sm:block">{topic.unseen}</span>
              <span
                className="w-16 text-right font-mono text-[13px] tnum"
                style={{ color: tone === 'lapsed' ? TONE_COLOR.lapsed : 'var(--ink-dim)' }}
              >
                {pct(topic.lapse_rate)}
              </span>
              <span
                className="w-20 text-right font-mono text-[13px] tnum"
                style={{ color: tone === 'mastered' ? TONE_COLOR.mastered : 'var(--ink-dim)' }}
              >
                {pct(topic.mastered_share)}
              </span>
              <span className="hidden w-12 text-right font-mono text-[13px] tnum text-ink-dim sm:block">
                {topic.mean_ease === null ? '—' : topic.mean_ease.toFixed(2)}
              </span>
            </>
          );

          return (
            <li key={topic.tag} className="border-b border-border last:border-b-0">
              {href ? (
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-[var(--radius-control)] py-2.5 outline-hidden transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  title={`Review unmastered ${topic.tag} cards`}
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-2.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
