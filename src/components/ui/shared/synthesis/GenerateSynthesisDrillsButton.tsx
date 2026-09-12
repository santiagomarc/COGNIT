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
  size?: 'sm' | 'default';
  variant?: 'default' | 'ghost';
  label?: string;
  className?: string;
};

/**
 * One reservation, up to five drills, generated in parallel (spec §6.2).
 * Partial success is reported as such rather than rounded up to "done".
 */
export function GenerateSynthesisDrillsButton({ deckId, count = 3, size = 'sm', variant = 'default', label, className }: GenerateSynthesisDrillsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      const result = await generateSynthesisDrills({ deck_id: deckId, count });
      if (!result || !('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Drill generation failed.'));
        return;
      }
      if (result.failed > 0) {
        toast.warning(`${result.created} of ${result.created + result.failed} drills generated — ${result.failed} failed validation. Try again for the rest.`);
      } else {
        toast.success(`${result.created} ${result.created === 1 ? 'drill' : 'drills'} generated`);
      }
      router.refresh();
    });
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={generate} disabled={isPending} className={className}>
      {isPending ? 'Generating…' : label ?? `Generate ${count} drills`}
    </Button>
  );
}
