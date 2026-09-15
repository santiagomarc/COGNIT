'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { generateSynthesisDrills } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';

type GenerateSynthesisDrillsButtonProps = {
  deckId: string;
  count?: number;
  /** Restrict clustering to one topic tag (audit F3); omitted = whole deck. */
  focusTopic?: string | null;
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
        result = await generateSynthesisDrills({ deck_id: deckId, count, focus_topic: focusTopic ?? undefined });
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
