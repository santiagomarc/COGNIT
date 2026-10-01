/**
 * Where "start drills on this deck" goes: up to three due drills, pulling the
 * weakest cards forward (micro-synthesis spec §4.1). Shared by Today's due
 * band and the Drills page (sidebar plan §4.2) so the two never disagree.
 */
export const DRILLS_PER_LAUNCH = 3;

export function drillSessionHref(deckId: string, dueCount: number): string {
  const count = Math.min(DRILLS_PER_LAUNCH, Math.max(1, Math.floor(dueCount) || 1));
  return `/dashboard/${deckId}/synthesis?count=${count}&pull=1`;
}
