'use client';

import Link from 'next/link';

import { StateTick, type TickState } from '@/components/ui/shared/StateTick';
import { DeckActions } from '@/components/ui/shared/DeckActions';

export type DeckRowData = {
  id: string;
  /** Already stripped of its `[tag]` prefix. */
  title: string;
  tag: string | null;
  cardCount: number;
  dueCount: number;
  /** Mean SM-2 ease across the deck's cards; null when nothing is scheduled. */
  easeFactor: number | null;
  masteryPercentage: number;
  assessedCards: number;
  lastQuizAt: string | null;
};

type DeckRowProps = {
  deck: DeckRowData;
  /** The untouched title, so rename keeps the tag prefix it came with. */
  rawTitle: string;
  onDeleteOptimistic: () => void;
  onDeleteRollback: () => void;
};

/*
 * The column geometry, declared once.
 *
 * The legend and the rows are separate elements, so any width or gap written
 * twice will drift — and it did: the header labels sat 12px right of the
 * numbers they named, because the legend used a different gap from the row.
 * Both read from here now.
 *
 * Columns drop from the right as the viewport narrows, and `due` is the last
 * one standing: it is the only number on the row that is a task rather than a
 * description.
 */
const DECK_COL = {
  row: 'flex items-center gap-3',
  metrics: 'flex items-center gap-4 sm:gap-6',
  cards: 'hidden w-12 text-right sm:block',
  due: 'w-8 text-right sm:w-12',
  ease: 'hidden w-12 text-right md:block',
  mastery: 'hidden w-[152px] text-right lg:block',
  quizzed: 'hidden w-12 text-right xl:block',
  actions: 'flex w-[68px] justify-end',
} as const;

/**
 * The deck's dominant state (design system §2.2).
 *
 * Order matters: work outranks progress. A deck with cards waiting reports
 * `due` even if it is 90% mastered, because the tick is there to say what to do
 * next, not to award a grade.
 */
function deckState(deck: DeckRowData): TickState {
  if (deck.cardCount === 0) return 'empty';
  if (deck.dueCount > 0) return 'due';
  if (deck.assessedCards === 0) return 'neutral';
  if (deck.masteryPercentage >= 70) return 'mastered';
  return 'learning';
}

/**
 * Compact ages: `now`, `2h`, `3d`, `4mo`, `2y`.
 *
 * `Intl.RelativeTimeFormat` renders "2 hours ago", which wraps to two lines in
 * a column this narrow and makes every row a different height — the one thing a
 * scan line cannot afford.
 */
function formatAge(iso: string | null): string {
  if (!iso) return '—';

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 2_592_000) return `${Math.round(seconds / 86_400)}d`;
  if (seconds < 31_536_000) return `${Math.round(seconds / 2_592_000)}mo`;
  return `${Math.round(seconds / 31_536_000)}y`;
}

/**
 * One deck, as a row of type with its numbers right-aligned (design system
 * §7.5) — not a tile.
 *
 * The trade was made deliberately: a tile grid showed four decks where a row
 * list shows twelve, and per-deck cover identity is worth less than seeing the
 * whole library at once. There is no card, no radius and no shadow here; the
 * row is separated from its neighbours by a 1px rule and nothing else.
 */
export function DeckRow({ deck, rawTitle, onDeleteOptimistic, onDeleteRollback }: DeckRowProps) {
  const state = deckState(deck);
  const hasMastery = deck.assessedCards > 0;

  return (
    <div
      className={`group -mx-2 ${DECK_COL.row} h-[38px] border-b border-border px-2 transition-colors last:border-b-0 hover:bg-surface`}
    >
      {/*
        The tick carries no label: every fact it encodes is already spelled out
        in the numbers to its right, so naming it here would make a screen
        reader read the row's state twice (§2.3 / WCAG 1.4.1).
      */}
      <StateTick state={state} />

      <Link
        href={`/dashboard/${deck.id}`}
        className="flex min-w-0 flex-1 items-baseline gap-2.5 rounded-[var(--radius-control)] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="truncate text-sm text-ink">{deck.title}</span>
        {deck.tag ? (
          <span className="shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            {deck.tag}
          </span>
        ) : null}
      </Link>

      {/* Mono and tabular throughout, so the numbers form real columns down the
          list instead of drifting row by row (§3.3). */}
      <dl className={`${DECK_COL.metrics} font-mono text-[13px] tnum`}>
        <div className={DECK_COL.cards}>
          <dt className="sr-only">Cards</dt>
          <dd className="text-ink-dim">{deck.cardCount}</dd>
        </div>

        <div className={DECK_COL.due}>
          <dt className="sr-only">Due</dt>
          <dd style={{ color: deck.dueCount > 0 ? 'var(--state-due)' : 'var(--ink-dimmer)' }}>
            {deck.dueCount}
          </dd>
        </div>

        <div className={DECK_COL.ease}>
          <dt className="sr-only">Ease factor</dt>
          <dd className="text-ink-dim">
            {deck.easeFactor === null ? '—' : deck.easeFactor.toFixed(2)}
          </dd>
        </div>

        <div className={DECK_COL.mastery}>
          <dt className="sr-only">Mastery</dt>
          <dd className="flex items-center justify-end gap-2">
            {/* 104 × 3px, track --border, fill --ink-dim, stepping to
                --state-mastered at 70% — the one place mastery earns a hue. */}
            <span aria-hidden="true" className="block h-[3px] w-[104px] overflow-hidden rounded-[1px] bg-border-strong">
              <span
                className="block h-full"
                style={{
                  width: `${hasMastery ? Math.min(100, deck.masteryPercentage) : 0}%`,
                  backgroundColor:
                    deck.masteryPercentage >= 70 ? 'var(--state-mastered)' : 'var(--ink-dim)',
                }}
              />
            </span>
            <span className="w-10 text-right text-ink-dim">
              {hasMastery ? `${deck.masteryPercentage}%` : '—'}
            </span>
          </dd>
        </div>

        <div className={DECK_COL.quizzed}>
          <dt className="sr-only">Last quizzed</dt>
          <dd className="text-ink-dimmer">{formatAge(deck.lastQuizAt)}</dd>
        </div>
      </dl>

      <div className={DECK_COL.actions}>
        <DeckActions
          deckId={deck.id}
          currentTitle={rawTitle}
          onDeleteOptimistic={onDeleteOptimistic}
          onDeleteRollback={onDeleteRollback}
        />
      </div>
    </div>
  );
}

/** The column legend, built from the same geometry as the rows beneath it. */
export function DeckRowLegend() {
  return (
    <div
      className={`-mx-2 ${DECK_COL.row} border-b border-border px-2 py-1.5 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer`}
    >
      <span className="w-[2px]" aria-hidden="true" />
      <span className="min-w-0 flex-1">Deck</span>
      <span className={DECK_COL.metrics}>
        <span className={DECK_COL.cards}>Cards</span>
        <span className={DECK_COL.due}>Due</span>
        <span className={DECK_COL.ease}>Ease</span>
        <span className={DECK_COL.mastery}>Mastery</span>
        <span className={DECK_COL.quizzed}>Quizzed</span>
      </span>
      <span className={DECK_COL.actions} aria-hidden="true" />
    </div>
  );
}
