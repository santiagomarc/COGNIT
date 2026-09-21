'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { generatePlanQuestions, generateSynthesisDrills } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import type { SynthesisFormat } from '@/lib/synthesis/types';

type GenerateSynthesisDrillsButtonProps = {
  deckId: string;
  count?: number;
  /** Restrict clustering to one topic tag (audit F3); omitted = whole deck. */
  focusTopic?: string | null;
  /** The formats the batch rotates through (plan D11); omitted = the mechanism three. */
  formats?: SynthesisFormat[];
  size?: 'sm' | 'default';
  variant?: 'default' | 'ghost';
  label?: string;
  className?: string;
};

/**
 * One reservation, up to five drills, generated in parallel (spec §6.2).
 * Partial success is reported as such rather than rounded up to "done", and
 * the toast names what arrived. The call is guarded: a request that never
 * comes back is a toast, not an error boundary (audit R1).
 */
export function GenerateSynthesisDrillsButton({
  deckId,
  count = 3,
  focusTopic = null,
  formats,
  size = 'sm',
  variant = 'default',
  label,
  className,
}: GenerateSynthesisDrillsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof generateSynthesisDrills>>;
      try {
        result = await generateSynthesisDrills({ deck_id: deckId, count, focus_topic: focusTopic ?? undefined, formats });
      } catch {
        toast.error('Drill generation did not come back. Check your connection and try again.');
        return;
      }
      if (!result || !('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Drill generation failed.'));
        return;
      }
      const topics = result.topics.length > 0 ? ` · ${result.topics.slice(0, 3).join(', ')}` : '';
      if (result.failed > 0) {
        toast.warning(`${result.created} of ${result.created + result.failed} drills generated${topics} — ${result.failed} failed validation. Try again for the rest.`);
      } else {
        toast.success(`${result.created} ${result.created === 1 ? 'drill' : 'drills'} generated${topics}`);
      }
      router.refresh();
    });
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={generate} disabled={isPending} aria-busy={isPending} className={className}>
      {isPending ? `Generating ${count}…` : label ?? `Generate ${count} drills`}
    </Button>
  );
}

type GeneratePlanQuestionButtonProps = {
  deckId: string;
  focusTopic?: string | null;
  /** A pasted question to build the plan from (plan D16). */
  questionId?: string | null;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'ghost';
  className?: string;
  onGenerated?: (result: { drillIds: string[]; missingConcepts: string[] }) => void;
};

/**
 * One plan question over 4–8 cards of a topic (plan D15). The toast names
 * the concepts the deck lacks for it, when the generator found any — the
 * single most actionable thing it can say.
 */
export function GeneratePlanQuestionButton({ deckId, focusTopic = null, questionId = null, label, size = 'sm', variant = 'default', className, onGenerated }: GeneratePlanQuestionButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof generatePlanQuestions>>;
      try {
        result = await generatePlanQuestions({ deck_id: deckId, count: 1, focus_topic: focusTopic ?? undefined, question_id: questionId ?? undefined });
      } catch {
        toast.error('Plan generation did not come back. Check your connection and try again.');
        return;
      }
      if (!result || !('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Plan generation failed.'));
        return;
      }
      if (result.missingConcepts.length > 0) {
        toast.warning(`Plan question ready — your deck has no cards for: ${result.missingConcepts.slice(0, 4).join(', ')}.`);
      } else {
        toast.success('Plan question ready');
      }
      onGenerated?.({ drillIds: result.drillIds, missingConcepts: result.missingConcepts });
      router.refresh();
    });
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={generate} disabled={isPending} aria-busy={isPending} className={className}>
      {isPending ? 'Writing the question…' : label ?? 'Plan question'}
    </Button>
  );
}
