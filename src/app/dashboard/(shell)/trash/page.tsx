import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import type { TrashedDeck } from '@/app/actions/deck-lifecycle';
import { TrashList } from '@/components/ui/shared/TrashList';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'Trash - Cognit',
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * Recently deleted decks (sidebar plan §4.4, DST-03). It used to be reachable
 * only from a closed `<details>` at the bottom of Today.
 *
 * Same two calls as `listTrashedDecks`: purge anything past its 30 days, then
 * list what is left. Both are SECURITY INVOKER RPCs that lift the trash filter
 * for the caller's own rows only (202609240900). A management screen, so no
 * `.raised` (design system §1b, Rev. E).
 */
export default async function TrashPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const supabase = await getRequestClient();

  const purged = await supabase.rpc('purge_expired_trash');
  if (purged.error) logger.warn('trash', 'purge_expired_trash failed', { message: purged.error.message });

  const { data, error } = await supabase.rpc('list_trashed_decks');
  if (error) logger.error('trash', 'list_trashed_decks failed', { message: error.message });

  const decks: TrashedDeck[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    deletedAt: row.deleted_at,
    purgeAfter: row.purge_after,
    cardCount: Number(row.card_count),
  }));

  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <header>
        <p className={LABEL}>Library</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Trash</h1>
        <p className="mt-1.5 max-w-xl text-[13px] text-ink-dim">
          Deleted decks stay here for 30 days. Restore one to bring back its cards, history and drills.
        </p>
      </header>

      {error ? (
        <p className="well px-4 py-6 text-center text-[13px] text-ink-dim">
          The trash could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <TrashList decks={decks} />
      )}
    </div>
  );
}
