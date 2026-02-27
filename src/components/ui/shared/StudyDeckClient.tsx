'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { CheckCircle2, XCircle, RotateCcw, ArrowLeft } from 'lucide-react';
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

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round((index / cards.length) * 100);
  }, [index, cards.length]);

  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-220, 220], [-14, 14]);
  const hardOpacity = useTransform(dragX, [-180, 0], [1, 0]);
  const easyOpacity = useTransform(dragX, [0, 180], [0, 1]);

  const swipeAway = (isEasy: boolean) => {
    if (isEasy) {
      setEasyCount((prev) => prev + 1);
    } else {
      setHardCount((prev) => prev + 1);
    }
    setShowAnswer(false);
    setIndex((prev) => prev + 1);
  };

  const restart = () => {
    setIndex(0);
    setShowAnswer(false);
    setEasyCount(0);
    setHardCount(0);
  };

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

  const completed = index >= cards.length;

  return (
    <div className="container mx-auto space-y-6 p-6 md:p-8 pb-28">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/dashboard/${deckId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Deck
        </Link>
        <div className="text-sm text-muted-foreground">{deckTitle}</div>
      </div>

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
            className="relative mx-auto h-[24rem] w-full max-w-2xl"
          >
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
                className="flex h-[17rem] w-full items-center justify-center rounded-2xl border border-primary/15 bg-background/25 px-6 text-center"
              >
                <p className="text-lg leading-relaxed">
                  {showAnswer ? active.back : active.front}
                </p>
              </button>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => swipeAway(false)} className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Hard
                </Button>
                <Button onClick={() => swipeAway(true)} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Easy
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
