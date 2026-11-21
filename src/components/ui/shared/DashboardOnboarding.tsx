'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
      router.push(`/dashboard/${deck.deckId}/study?scope=due`);
    } catch {
      toast.error('Something went wrong setting up that deck. Please try again.');
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="surface space-y-8 p-6 md:p-8">
      <div className="max-w-xl space-y-3">
        <p className="type-label text-ink-dimmer">
          Getting started
        </p>
        <h2 className="font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance">
          Cognit schedules what you review, and when
        </h2>
        <p className="text-sm leading-relaxed text-ink-dim">
          Turn your material into flashcards, grade each one as you recall it, and the SM-2
          scheduler decides when it comes back — sooner for what you find hard, later for what you
          already know. Three ways to start, fastest first.
        </p>
      </div>

      {/*
        Three ways in, not three steps (UIUX plan FLOW-04): they are
        alternatives, so they're named by what they are, not numbered. The
        times are the fact that helps a new user choose. The one filled button
        is the starter deck: it is the fastest way to a first review.
      */}
      <ul className="grid gap-px border-t border-border md:grid-cols-3 md:border-t-0">
        <OnboardingStep
          kind="Fastest"
          title="Try a starter deck"
          body="20 ready-made cards, already written. You are reviewing in about five seconds."
          cost="~5 s"
        >
          <div className="flex flex-wrap gap-2">
            {STARTER_DECK_KEYS.map((key, position) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={position === 0 ? 'primary' : 'default'}
                onClick={() => createStarterDeck(key)}
                disabled={loadingKey !== null}
                className="gap-1.5"
              >
                {loadingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {STARTER_DECKS[key].shortLabel}
              </Button>
            ))}
          </div>
        </OnboardingStep>

        <OnboardingStep
          kind="From your material"
          title="Upload a PDF"
          body="Lecture slides, a chapter, your own notes. The cards get written for you."
          cost="about a minute"
        >
          <Button type="button" size="sm" onClick={onCreateOwn}>
            New deck, then upload
          </Button>
        </OnboardingStep>

        <OnboardingStep
          kind="By hand"
          title="Write your own"
          body={'Paste notes as "Term - Definition", or add cards one at a time.'}
          cost="a few minutes"
        >
          <Button type="button" size="sm" onClick={onCreateOwn}>
            Create a deck
          </Button>
        </OnboardingStep>
      </ul>
    </div>
  );
}

function OnboardingStep({
  kind,
  title,
  body,
  cost,
  children,
}: {
  kind: string;
  title: string;
  body: string;
  cost: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border py-5 md:border-b-0 md:border-t md:pr-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-label text-ink-dimmer">{kind}</span>
        <span className="type-label tnum text-ink-dimmer">
          {cost}
        </span>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-[-.015em] text-foreground">{title}</h3>
        <p className="type-sm leading-relaxed text-ink-dim">{body}</p>
      </div>

      <div className="mt-auto pt-1">{children}</div>
    </li>
  );
}
