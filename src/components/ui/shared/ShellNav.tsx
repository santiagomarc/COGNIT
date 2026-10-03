import { Breadcrumb } from '@/components/ui/shared/Breadcrumb';
import { CommandPalette } from '@/components/ui/shared/CommandPalette';
import { loadShellNav } from '@/lib/shell-nav';

/**
 * The shell's two slots that need the deck list, each behind its own Suspense
 * boundary in the shell layout: the breadcrumb, and the command palette —
 * headless now, opened by the sidebar's Search and ⌘K (sidebar plan §6.8).
 *
 * They exist so the layout itself never waits on the database: the sidebar
 * frame, the header bar and the page's own skeleton go out on the first
 * flush, and these fill in when `loadShellNav` resolves — off one shared
 * promise with the sidebar's own reads. Before this the whole response,
 * skeleton included, sat behind the layout's queries.
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
