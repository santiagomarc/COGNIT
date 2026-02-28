'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { CheckCircle2, XCircle, RotateCcw, ArrowLeft, Keyboard } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type StudyCard = {
  id: string;
  front: string;
  back: string;
};

type StudyDeckClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudyCard[];
};

export function StudyDeckClient({ deckId, deckTitle, cards }: StudyDeckClientProps) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [easyCount, setEasyCount] = useState(0);
  const [hardCount, setHardCount] = useState(0);

  const active = cards[index];
  const next = cards[index + 1];
  const completed = index >= cards.length;

  // Fix: use (index + 1) so progress shows 100% when the last card is graded
  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round(((completed ? cards.length : index) / cards.length) * 100);
  }, [index, cards.length, completed]);

  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-220, 220], [-14, 14]);
  const hardOpacity = useTransform(dragX, [-180, 0], [1, 0]);
  const easyOpacity = useTransform(dragX, [0, 180], [0, 1]);

  const swipeAway = useCallback((isEasy: boolean) => {
    if (isEasy) {
      setEasyCount((prev) => prev + 1);
    } else {
      setHardCount((prev) => prev + 1);
    }
    setShowAnswer(false);
    setIndex((prev) => prev + 1);
  }, []);

  const restart = () => {
    setIndex(0);
    setShowAnswer(false);
    setEasyCount(0);
    setHardCount(0);
  };

  // ─── Keyboard navigation ───
  useEffect(() => {
    if (completed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          setShowAnswer((prev) => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          swipeAway(false);
          break;
        case 'ArrowRight':
          e.preventDefault();
          swipeAway(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completed, swipeAway]);

  if (cards.length === 0) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <h1 className="text-2xl font-semibold">No cards to study yet</h1>
          <p className="mt-2 text-muted-foreground">Add cards to this deck first, then come back to Study Mode.</p>
          <Link href={`/dashboard/${deckId}`} className="mt-6 inline-block">
            <Button>Back to Deck</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6 md:p-8 pb-28">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/dashboard/${deckId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Deck
        </Link>
        <div className="text-sm text-muted-foreground">{deckTitle}</div>
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{Math.min(progress, 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          />
        </div>
      </div>

      {/* Live region for screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {completed
          ? `Study session complete. Easy: ${easyCount}, Hard: ${hardCount}.`
          : `Card ${index + 1} of ${cards.length}. ${showAnswer ? 'Answer: ' + active.back : 'Question: ' + active.front}`
        }
      </div>

      <AnimatePresence mode="wait">
        {completed ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center"
          >
            <h2 className="text-2xl font-semibold">Session complete</h2>
            <p className="mt-3 text-muted-foreground">Easy: {easyCount} · Hard: {hardCount}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={restart} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restart
              </Button>
              <Link href={`/dashboard/${deckId}`}>
                <Button variant="outline">Back to Deck</Button>
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="mx-auto w-full max-w-2xl space-y-4"
          >
            {/* Card area — draggable */}
            <div className="relative h-[20rem]">
              {next && (
                <motion.div
                  className="glass-card absolute inset-0 rounded-3xl"
                  initial={false}
                  animate={{ scale: 0.96, y: 10, opacity: 0.55 }}
                />
              )}

              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                style={{ x: dragX, rotate }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 120) {
                    swipeAway(true);
                  } else if (info.offset.x < -120) {
                    swipeAway(false);
                  }
                }}
                whileTap={{ scale: 0.995 }}
                className="glass-card glow-border absolute inset-0 cursor-grab rounded-3xl p-7 active:cursor-grabbing"
              >
                <motion.div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5" style={{ opacity: hardOpacity }}>
                  <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-2 text-red-300">
                    <XCircle className="h-6 w-6" />
                  </div>
                </motion.div>

                <motion.div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-5" style={{ opacity: easyOpacity }}>
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-2 text-emerald-300">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </motion.div>

                <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Card {index + 1} of {cards.length}</span>
                  <span>{showAnswer ? 'Answer' : 'Question'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAnswer((prev) => !prev)}
                  className="flex h-[13rem] w-full items-center justify-center overflow-y-auto rounded-2xl border border-primary/15 bg-background/25 px-6 text-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background/0"
                  aria-label={showAnswer ? 'Showing answer. Press to show question.' : 'Showing question. Press to reveal answer.'}
                >
                  <p className="text-lg leading-relaxed line-clamp-6">
                    {showAnswer ? active.back : active.front}
                  </p>
                </button>
              </motion.div>
            </div>

            {/* Action buttons — outside the drag zone */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => swipeAway(false)} className="gap-2">
                <XCircle className="h-4 w-4" />
                Hard
              </Button>
              <Button onClick={() => swipeAway(true)} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Easy
              </Button>
            </div>

            {/* Keyboard hint */}
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/70">
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Keyboard className="h-3.5 w-3.5" />
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> flip
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">←</kbd> hard
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">→</kbd> easy
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
