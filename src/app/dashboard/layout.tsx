import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Cognit',
  description: 'Manage your study decks and track your progress.',
};

/**
 * The dashboard subtree's single owner of bottom clearance (defect F-03).
 *
 * The old code applied a 7rem bottom pad here *and* again inside every page
 * below it, so the two nested to 224px of dead space for a dock about 74px
 * tall. The dock is gone (§8), so `--dock-clearance` is `0` — but the token
 * stays and the padding stays declared in exactly one place, because the
 * failure mode was never the value. It was seven files each deciding for
 * themselves.
 *
 * Chrome is chosen structurally one level down, not by a `usePathname()` test:
 *
 *   (shell)  — rail + header + `⌘K`   → /dashboard, /dashboard/[deckId]
 *   (focus)  — no navigation chrome    → …/study, …/quiz
 *
 * A route in `(focus)` cannot acquire a rail by accident, which is the property
 * the deleted dock's `CHROMELESS_ROUTE` regex could only approximate.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div style={{ paddingBottom: 'var(--dock-clearance)' }}>{children}</div>;
}
