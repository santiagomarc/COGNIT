'use client';

import { useState } from 'react';
import { FlipCard } from '@/components/ui/shared/FlipCard';

type FlashcardProps = {
  question: string;
  answer: string;
};

/**
 * Uncontrolled convenience wrapper around FlipCard, used by the deck grid and
 * the public share page. The study view uses FlipCard directly because it needs
 * to own the flipped state.
 */
export function Flashcard({ question, answer }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <FlipCard
      isFlipped={isFlipped}
      onFlip={() => setIsFlipped((prev) => !prev)}
      front={
        <div className="h-full rounded-2xl border border-primary/20 bg-card/60 p-6 text-card-foreground shadow-lg backdrop-blur-xl transition-shadow duration-300 group-hover:shadow-[0_0_24px_-4px_var(--glow)]">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Question</p>
          </div>
          <p className="line-clamp-6 text-base leading-relaxed">{question}</p>
        </div>
      }
      back={
        <div className="h-full rounded-2xl border border-neon/30 bg-card/60 p-6 text-card-foreground shadow-lg backdrop-blur-md transition-shadow duration-300 group-hover:shadow-[0_0_24px_-4px_var(--glow)]">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon" />
            <p className="text-xs font-semibold uppercase tracking-widest text-neon/80">Answer</p>
          </div>
          <p className="line-clamp-6 text-base leading-relaxed text-foreground/90">{answer}</p>
        </div>
      }
    />
  );
}
