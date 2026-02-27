'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type FlashcardProps = {
  question: string;
  answer: string;
};

export function Flashcard({ question, answer }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setIsFlipped((prev) => !prev)}
      className="group w-full text-left"
      aria-label="Flip flashcard"
      aria-pressed={isFlipped}
    >
      {/*
        3D transform mechanics:
        - `perspective-1000` creates depth so rotation looks like a real flip.
        - `preserve-3d` keeps children in 3D space during rotation.
        - `rotate-y-180` rotates the inner wrapper, revealing the back face.
      */}
      <div className="perspective-1000 h-56 w-full">
        <div
          className={cn(
            'relative h-full w-full preserve-3d rounded-2xl transition-transform duration-500 ease-out',
            isFlipped && 'rotate-y-180',
          )}
        >
          {/* Front face (Question) */}
          <div className="backface-hidden absolute inset-0 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm transition-shadow group-hover:shadow-md">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Question</p>
            <p className="line-clamp-6 text-base leading-relaxed">{question}</p>
          </div>

          {/* Back face (Answer), pre-rotated 180deg so it appears when parent flips */}
          <div className="backface-hidden rotate-y-180 absolute inset-0 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm transition-shadow group-hover:shadow-md">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
            <p className="line-clamp-6 text-base leading-relaxed text-primary/90">{answer}</p>
          </div>
        </div>
      </div>
    </button>
  );
}
