'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus } from 'lucide-react';
import { cloneSharedDeck } from '@/app/actions/share';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { toast } from 'sonner';

type CloneDeckButtonProps = {
  shareToken: string;
  deckTitle: string;
};

export function CloneDeckButton({ shareToken, deckTitle }: CloneDeckButtonProps) {
  const router = useRouter();
  const [isCloning, setIsCloning] = useState(false);
  const [cloned, setCloned] = useState(false);

  async function handleClone() {
    if (isCloning || cloned) return;

    setIsCloning(true);
    try {
      const result = await cloneSharedDeck(shareToken);

      if (result?.error || !result?.success) {
        toast.error(formatActionError(result?.error, 'Failed to save this deck.'));
        return;
      }

      setCloned(true);
      toast.success(`"${deckTitle}" saved to your library.`);
      router.push(`/dashboard/${result.deckId}`);
    } catch {
      toast.error('Something went wrong saving this deck. Please try again.');
    } finally {
      setIsCloning(false);
    }
  }

  return (
    <Button type="button" size="lg" onClick={handleClone} disabled={isCloning || cloned} className="gap-2">
      {isCloning ? <Loader2 className="h-4 w-4 animate-spin" /> : cloned ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {isCloning ? 'Saving…' : cloned ? 'Saved' : 'Save to my library'}
    </Button>
  );
}
