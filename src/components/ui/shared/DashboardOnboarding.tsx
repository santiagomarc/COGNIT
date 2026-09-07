'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { m } from 'framer-motion';
import { FileText, Loader2, PenLine, Sparkles, Upload } from 'lucide-react';
import { createDeck } from '@/app/actions/deck';
import { bulkImportCards } from '@/app/actions/card';
import { STARTER_DECKS, STARTER_DECK_KEYS, type StarterDeckKey } from '@/lib/starter-decks';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { requestOpenCreateDeck } from '@/lib/dashboard-events';
import { toast } from 'sonner';

type DashboardOnboardingProps = {
  /** Defaults to asking CreateDeckModal to open via a named window event. */
  onCreateOwn?: () => void;
};

/**
 * Shown only when the user has zero decks.
 *
 * Three paths, ordered by time-to-first-review: a starter deck is about five
 * seconds, a PDF around thirty, writing your own a couple of minutes.
 */
export function DashboardOnboarding({
  onCreateOwn = requestOpenCreateDeck,
}: DashboardOnboardingProps) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<StarterDeckKey | null>(null);

  async function createStarterDeck(key: StarterDeckKey) {
    if (loadingKey) return;

    const starter = STARTER_DECKS[key];
    setLoadingKey(key);

    try {
      const deck = await createDeck({
        title: starter.title,
        accent_tag: starter.tag,
        description: starter.description,
        is_public: false,
      });

      if (deck?.error || !deck?.deckId) {
        toast.error(formatActionError(deck?.error, 'Could not create the starter deck. Please try again.'));
        return;
      }

      const imported = await bulkImportCards({
        deck_id: deck.deckId,
        cards: starter.cards.map((card) => ({ front: card.front, back: card.back })),
        imported_by: 'Cognit starter deck',
      });

      if (imported?.error || !imported?.success) {
        // The deck exists and is usable even though the cards failed. Say so
        // plainly and land the user somewhere they can recover, rather than
        // pretending the whole thing worked.
        toast.error('Deck created, but the cards failed to import. Open it and try Bulk Import.');
        router.push(`/dashboard/${deck.deckId}`);
        return;
      }

      toast.success(`"${starter.title}" is ready — ${starter.cards.length} cards.`);
      router.push(`/dashboard/${deck.deckId}/study?count=10&scope=due`);
    } catch {
      toast.error('Something went wrong setting up that deck. Please try again.');
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card glow-border space-y-6 rounded-3xl p-6 md:p-8"
    >
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to Cognit</h2>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          Turn any material into flashcards, then let spaced repetition decide when you
          review them. Pick the fastest way to start:
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <OnboardingCard
          icon={<Sparkles className="h-5 w-5 text-primary" />}
          title="Try a starter deck"
          body="20 ready-made cards. Start reviewing in about five seconds."
          badge="Fastest"
        >
          <div className="flex flex-wrap gap-2">
            {STARTER_DECK_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => createStarterDeck(key)}
                disabled={loadingKey !== null}
                className="gap-1.5"
              >
                {loadingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {STARTER_DECKS[key].shortLabel}
              </Button>
            ))}
          </div>
        </OnboardingCard>

        <OnboardingCard
          icon={<Upload className="h-5 w-5 text-primary" />}
          title="Upload a PDF"
          body="Lecture slides, a chapter, your own notes. The AI writes the cards."
          badge="Most popular"
        >
          <Button type="button" size="sm" onClick={onCreateOwn} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            New deck + upload
          </Button>
        </OnboardingCard>

        <OnboardingCard
          icon={<PenLine className="h-5 w-5 text-primary" />}
          title="Write your own"
          body={'Paste notes as "Term - Definition", or add cards one at a time.'}
        >
          <Button type="button" size="sm" variant="outline" onClick={onCreateOwn}>
            Create a deck
          </Button>
        </OnboardingCard>
      </div>
    </m.div>
  );
}

function OnboardingCard({
  icon,
  title,
  body,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-card/30 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          {icon}
        </div>
        {badge ? (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>

      <div className="mt-auto pt-1">{children}</div>
    </div>
  );
}
