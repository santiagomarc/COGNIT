import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { Breadcrumb } from '@/components/ui/shared/Breadcrumb';
import { CommandPalette } from '@/components/ui/shared/CommandPalette';
import { loadShellNav } from '@/lib/shell-nav';

/**
 * The two header slots that need the deck list, each behind its own Suspense
 * boundary in the shell layout.
 *
 * They exist so the layout itself never waits on the database: the rail, the
 * header bar and the page's own skeleton go out on the first flush, and these
 * fill in when `loadShellNav` resolves — off one shared promise, so both land
 * together. Before this the whole response, skeleton included, sat behind the
 * layout's queries.
 */

export async function ShellBreadcrumb({ userId }: { userId: string }) {
  const { decks } = await loadShellNav(userId);
  return <Breadcrumb decks={decks} />;
}

/** The trail with its deck title still to come. */
export function ShellBreadcrumbFallback() {
  return <Breadcrumb decks={null} />;
}

export async function ShellCommandPalette({ userId }: { userId: string }) {
  const { decks, sessionHref, totalDue } = await loadShellNav(userId);
  return <CommandPalette decks={decks} sessionHref={sessionHref} totalDue={totalDue} />;
}

/**
 * The palette's trigger, drawn but inert, so the header keeps its shape while
 * the command list loads. The same markup as the live trigger, minus the
 * handlers — a control that flickers into a different size is worse than one
 * that is briefly disabled.
 */
export function ShellCommandPaletteFallback() {
  return (
    <Button type="button" className="gap-2" aria-label="Open the command palette" disabled>
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Search</span>
      <Kbd>⌘K</Kbd>
    </Button>
  );
}
