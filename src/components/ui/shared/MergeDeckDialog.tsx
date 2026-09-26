'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mergeDecks } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';

export type MergeTarget = { id: string; title: string; cardCount: number };

export type MergeDeckDialogProps = {
  sourceDeckId: string;
  sourceTitle: string;
  /** The user's other decks; the source is filtered out here too. */
  targets: MergeTarget[];
};

/**
 * Merge this deck into another (plan §4.1b). The consequences are stated
 * before the click, in the dialog's own words, because they are not all
 * obvious: drill history cannot move (attempts are append-only).
 */
export function MergeDeckDialog({ sourceDeckId, sourceTitle, targets }: MergeDeckDialogProps) {
  const router = useRouter();
  const selectId = useId();
  const candidates = targets.filter((target) => target.id !== sourceDeckId);
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const target = candidates.find((candidate) => candidate.id === targetId);

  if (candidates.length === 0) return null;

  const merge = () => startTransition(async () => {
    const result = await mergeDecks({ source_id: sourceDeckId, target_id: targetId });
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not merge the decks.'));
      return;
    }
    setOpen(false);
    toast.success(`${result.movedCards} cards moved into ${target?.title ?? 'the deck'}`);
    router.push(`/dashboard/${targetId}`);
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="text-[13px] text-ink-dim">Merge into</label>
      <select
        id={selectId}
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        className="h-[44px] rounded-[var(--radius-md)] border border-[var(--border-control)] bg-transparent px-2 text-base text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:h-[34px] sm:text-sm"
      >
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.title} · {candidate.cardCount} cards
          </option>
        ))}
      </select>
      <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)} disabled={!target}>
        Merge…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Merge ${sourceTitle} into ${target?.title ?? '…'}?`}
        description={`Its cards move with their review history and quiz progress. ${sourceTitle} then goes to the trash for 30 days with its quiz and drill history; its drills are archived, and new drills can link cards from both decks.`}
        confirmLabel="Merge"
        loading={isPending}
        onConfirm={merge}
      />
    </div>
  );
}
