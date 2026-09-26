import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';

const PAGE_SIZE = 24;
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

export const metadata = { title: 'Explore decks — Cognit' };
/**
 * Rendered per request: the EXPLORE_ENABLED check must run at request time.
 * Left static, the build prerenders the flag-off 404 and flipping the flag
 * in production would never show the page.
 */
export const dynamic = 'force-dynamic';

/** Anonymous, cookie-less: the directory is the same for everyone. */
function directoryClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The public deck directory (plan §4.1d), behind EXPLORE_ENABLED until
 * moderation is in place. Deck rows, not tiles (design system §7.5); each
 * opens the existing shared-deck page, which already offers "Save a copy".
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  if (process.env.EXPLORE_ENABLED !== 'true') notFound();

  const { q, page } = await searchParams;
  const query = q?.trim().slice(0, 80) ?? '';
  const pageIndex = Math.max(0, Number.parseInt(page ?? '0', 10) || 0);
  const { data, error } = await directoryClient().rpc('list_public_decks', {
    ...(query ? { p_query: query } : {}),
    p_limit: PAGE_SIZE,
    p_offset: pageIndex * PAGE_SIZE,
  });
  const decks = error ? [] : data ?? [];

  return (
    <main id="main-content" className="container mx-auto flex max-w-3xl flex-col gap-4 p-4 md:py-10">
      <header>
        <p className={LABEL}>Directory</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Explore decks</h1>
      </header>
      <form role="search" className="flex gap-2">
        <label htmlFor="explore-q" className="sr-only">Search deck titles</label>
        <input
          id="explore-q"
          name="q"
          defaultValue={query}
          placeholder="Search titles"
          className="h-[44px] min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-control)] bg-transparent px-3 text-base text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:text-sm"
        />
      </form>
      {decks.length === 0 ? (
        <p className="surface p-5 text-sm text-ink-dim">{error ? 'The directory is unavailable right now.' : 'No listed decks match.'}</p>
      ) : (
        <ul className="well overflow-hidden px-3.5">
          {decks.map((deck) => (
            <li key={deck.share_token} className="border-b border-border last:border-b-0">
              <Link
                href={`/s/${deck.share_token}`}
                className="flex items-center gap-3 py-3 outline-hidden hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{deck.title}</span>
                  {deck.description ? <span className="block truncate text-[13px] text-ink-dim">{deck.description}</span> : null}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[13px] tnum text-ink-dim">{deck.card_count}</span>
                <span className="w-20 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer">{deck.clone_count} saves</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pages" className="flex justify-between text-sm">
        {pageIndex > 0 ? <Link href={`/explore?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageIndex - 1) })}`}>Previous</Link> : <span />}
        {decks.length === PAGE_SIZE ? <Link href={`/explore?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageIndex + 1) })}`}>Next</Link> : null}
      </nav>
    </main>
  );
}
