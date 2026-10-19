'use client';

import dynamic from 'next/dynamic';
import { OPEN_CREATE_DECK_EVENT, OPEN_SHORTCUTS_EVENT } from '@/lib/dashboard-events';
import { opensCreateDeck, opensShortcuts } from '@/lib/shell-hotkeys';
import { useLazyDialog } from '@/lib/use-lazy-dialog';

const loadCreateDeck = () => import('@/components/ui/shared/CreateDeckModal');
const loadShortcuts = () => import('@/components/ui/shared/KeyboardShortcutsDialog');

const CreateDeckModal = dynamic(() => loadCreateDeck().then((mod) => mod.CreateDeckModal), { ssr: false });
const KeyboardShortcutsDialog = dynamic(() => loadShortcuts().then((mod) => mod.KeyboardShortcutsDialog), { ssr: false });

/**
 * The shell's create-deck and shortcuts dialogs, loaded on first use
 * (performance plan PERF-13). Every chromed page used to ship them before
 * anyone pressed ⌘N or ?. The keys and open events behave as before.
 */
export function LazyShellDialogs() {
  const createDeck = useLazyDialog({ eventName: OPEN_CREATE_DECK_EVENT, opensOn: opensCreateDeck, preload: loadCreateDeck });
  const shortcuts = useLazyDialog({ eventName: OPEN_SHORTCUTS_EVENT, opensOn: opensShortcuts, preload: loadShortcuts });

  return (
    <>
      {createDeck !== 'waiting' ? <CreateDeckModal defaultOpen={createDeck === 'open'} /> : null}
      {shortcuts !== 'waiting' ? <KeyboardShortcutsDialog defaultOpen={shortcuts === 'open'} /> : null}
    </>
  );
}
