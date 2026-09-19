'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type BreadcrumbProps = {
  /**
   * Titles already stripped of their `[tag]` prefix by the caller. Null while
   * the shell is still loading them — the trail keeps its shape and shows a
   * placeholder where the title will land, rather than the wrong word.
   */
  decks: { id: string; title: string }[] | null;
};

/**
 * The route trail (design system §8, task 8.3).
 *
 * It carries the "back to the deck index" job the dock's Dashboard slot used to
 * do, and does it on mobile too — where §8 leaves no bottom bar to put a link
 * in. Derived from the pathname rather than passed down, because the shell
 * layout sits above `[deckId]` and never receives that param.
 *
 * Focus routes are not in this layout at all, so there is no trail to draw on
 * study or quiz — which is the point of putting them in their own route group.
 */
export function Breadcrumb({ decks }: BreadcrumbProps) {
  const pathname = usePathname();
  const segment = pathname.match(/^\/dashboard\/([^/]+)/)?.[1];
  // Named chromed routes sit beside the deck ids; a UUID is a deck.
  const isStats = segment === 'stats';
  const deckId = segment && !isStats ? segment : undefined;
  const deck = deckId && decks ? decks.find((entry) => entry.id === deckId) : undefined;
  const trailLabel = isStats ? 'Statistics' : deck?.title ?? 'Deck';
  const hasTrail = Boolean(deckId) || isStats;
  const trailPending = Boolean(deckId) && decks === null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm">
        <li className="shrink-0">
          {hasTrail ? (
            <Link
              href="/dashboard"
              className="rounded-[var(--radius-control)] text-ink-dim outline-hidden transition-colors duration-[120ms] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Decks
            </Link>
          ) : (
            <span aria-current="page" className="text-ink">
              Decks
            </span>
          )}
        </li>

        {hasTrail ? (
          <>
            <li aria-hidden="true" className="shrink-0 text-ink-dimmer">
              /
            </li>
            <li className="min-w-0">
              <span aria-current="page" className="block truncate text-ink">
                {/* A deck outside the shell's list — past its row cap, or one
                    just deleted — still gets a trail rather than a blank. */}
                {trailPending ? (
                  <span
                    role="status"
                    aria-label="Loading deck title"
                    className="glass-skeleton inline-block h-3.5 w-24 rounded-sm align-middle"
                  />
                ) : (
                  trailLabel
                )}
              </span>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
