import Link from 'next/link';

export const DECK_TABS = ['overview', 'cards', 'insights', 'chat'] as const;
export type DeckTab = (typeof DECK_TABS)[number];

/** Anything unrecognised resolves to overview rather than 404ing a deep link. */
export function resolveDeckTab(value: string | string[] | undefined): DeckTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return (DECK_TABS as readonly string[]).includes(raw ?? '') ? (raw as DeckTab) : 'overview';
}

type DeckSegmentsProps = {
  deckId: string;
  active: DeckTab;
  cardCount: number;
};

const LABELS: Record<DeckTab, string> = {
  overview: 'Overview',
  cards: 'Cards',
  insights: 'Insights',
  chat: 'Chat',
};

/**
 * The deck workspace's segmented control (Run 6, Task 3.2).
 *
 * The deck page used to be ten major components stacked in one column at
 * near-equal visual weight. Segmentation is the only device that actually
 * reduces *quantity on screen*, which is what "overwhelming" means.
 *
 * These are plain links, not client-side tab state. The deck page is
 * deep-linked from the dashboard, the due-now band, the command palette and
 * share links, so the active segment has to live in the URL — and once it does,
 * `<Link>` gets back/forward, middle-click and prefetch for free, ships no
 * JavaScript, and lets the server render only the active segment's data.
 *
 * `scroll={false}` keeps the header and the segment bar still while the panel
 * below them changes, which is what a tab is supposed to feel like.
 */
export function DeckSegments({ deckId, active, cardCount }: DeckSegmentsProps) {
  return (
    <nav
      aria-label="Deck sections"
      className="flex items-center gap-0.5 overflow-x-auto border-b border-border scrollbar-none"
    >
      {DECK_TABS.map((tab) => {
        const isActive = tab === active;

        return (
          <Link
            key={tab}
            href={tab === 'overview' ? `/dashboard/${deckId}` : `/dashboard/${deckId}?tab=${tab}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={`relative shrink-0 rounded-t-[var(--radius-sm)] px-3.5 pb-2.5 text-[13px] outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              isActive ? 'font-semibold text-ink' : 'text-ink-dimmer hover:text-ink-dim'
            }`}
          >
            <span className="inline-flex items-baseline gap-1.5">
              {LABELS[tab]}
              {tab === 'cards' ? (
                <span className="font-mono text-[11px] tnum">{cardCount}</span>
              ) : null}
            </span>
            {/* The indicator sits on the container's own bottom rule rather than
                under it, so the active segment reads as continuous with its panel. */}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px block h-[2px] bg-ink"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
