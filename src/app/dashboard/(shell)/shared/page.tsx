import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SharedDeckList } from '@/components/ui/shared/SharedDeckList';
import { loadSharedDecks } from '@/lib/sharing';
import { getRequestClient, getRequestNow, getSessionUser } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'Shared - Cognit',
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * Every deck the user shares by link (sidebar plan §4.3, DST-02). Sharing used
 * to be managed one deck at a time on each deck page; this is the one place
 * to see what is out there and turn it off.
 *
 * A management screen, so no `.raised` (design system §1b, Rev. E).
 */
export default async function SharedPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const supabase = await getRequestClient();
  const decks = await loadSharedDecks(supabase, user.id, getRequestNow());
  const exploreEnabled = process.env.EXPLORE_ENABLED === 'true';

  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <header>
        <p className={LABEL}>Library</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Shared</h1>
        <p className="mt-1.5 max-w-xl text-[13px] text-ink-dim">
          Anyone with a link can view and copy that deck&rsquo;s cards. Your study history, quiz scores and chat stay
          private.
        </p>
      </header>

      <SharedDeckList decks={decks} exploreEnabled={exploreEnabled} />
    </div>
  );
}
