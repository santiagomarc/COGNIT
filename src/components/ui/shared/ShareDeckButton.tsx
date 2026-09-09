'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, RefreshCw } from 'lucide-react';
import { setDeckSharing } from '@/app/actions/share';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { toast } from 'sonner';

type ShareDeckButtonProps = {
  deckId: string;
  initialToken: string | null;
};

export function ShareDeckButton({ deckId, initialToken }: ShareDeckButtonProps) {
  const [token, setToken] = useState(initialToken);
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  // window is not available during SSR, so the URL is assembled after mount.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = token && origin ? `${origin}/s/${token}` : null;

  async function toggle(enabled: boolean, rotate = false) {
    setIsPending(true);
    try {
      const result = await setDeckSharing({ deck_id: deckId, enabled, rotate });

      if (result?.error || !result?.success) {
        toast.error(formatActionError(result?.error, 'Failed to update sharing.'));
        return;
      }

      setToken(result.shareToken);
      toast.success(
        enabled
          ? rotate ? 'New link generated — the old one no longer works.' : 'Deck shared.'
          : 'Sharing turned off.',
      );
    } catch {
      toast.error('Failed to update sharing. Please try again.');
    } finally {
      setIsPending(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied.');
    } catch {
      // The clipboard API is unavailable over plain http:// and inside some
      // in-app browsers, so tell the user rather than failing silently.
      toast.error('Copy failed — select the link and copy it manually.');
    }
  }

  if (!token) {
    return (
      <Button type="button" variant="outline" onClick={() => toggle(true)} disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        Share deck
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-border bg-card/30 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
        Anyone with this link can view and copy this deck
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-3 py-2 text-xs">
          {shareUrl ?? 'Preparing link…'}
        </code>

        <Button type="button" size="sm" onClick={copy} disabled={!shareUrl} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => toggle(true, true)}
          disabled={isPending}
          title="Generate a new link and invalidate the old one"
          aria-label="Generate a new share link"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        <Button type="button" size="sm" variant="ghost" onClick={() => toggle(false)} disabled={isPending}>
          Stop sharing
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Your study history, quiz scores and chat stay private — only the cards are shared.
      </p>
    </div>
  );
}
