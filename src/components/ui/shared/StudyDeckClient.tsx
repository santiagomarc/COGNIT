'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  RotateCcw,
  ArrowLeft,
  Keyboard,
  Timer,
  Zap,
  Brain,
  TrendingUp,
  ChevronRight,
  Flame,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { gradeCard } from '@/app/actions';
import type { StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { toast } from 'sonner';

// ── Types ──

export type StudyCard = {
  id: string;
  front: string;
  back: string;
  state: CardState;
  interval: number;
  ease_factor: number;
  repetition_count: number;
};

type StudyDeckClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudyCard[];
  totalInDeck: number;
};

// ── Grade button config ──

const GRADE_BUTTONS: {
  grade: StudyGrade;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  key: string;
}[] = [
  {
    grade: 'again',
    label: 'Again',
    shortLabel: '< 1m',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 hover:bg-red-500/20',
    borderColor: 'border-red-500/20',
    key: '1',
  },
  {
    grade: 'hard',
    label: 'Hard',
    shortLabel: '~1d',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 hover:bg-orange-500/20',
    borderColor: 'border-orange-500/20',
    key: '2',
  },
  {
    grade: 'good',
    label: 'Good',
    shortLabel: 'Next',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    borderColor: 'border-emerald-500/20',
    key: '3',
  },
  {
    grade: 'easy',
    label: 'Easy',
    shortLabel: 'Skip',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 hover:bg-sky-500/20',
    borderColor: 'border-sky-500/20',
    key: '4',
  },
];

// ── Helpers ──

function formatInterval(days: number): string {
  if (days < 1) return '< 1 min';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StudyDeckClient({
  deckId,
  deckTitle,
  cards,
  totalInDeck,
}: StudyDeckClientProps) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [gradeLog, setGradeLog] = useState<StudyGrade[]>([]);
  const [isPending, startTransition] = useTransition();

  // Session timer
  const sessionStart = useRef(Date.now());
  const cardStart = useRef(Date.now());

  const active = cards[index];
  const next = cards[index + 1];
  const completed = index >= cards.length;

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round(((completed ? cards.length : index) / cards.length) * 100);
  }, [index, cards.length, completed]);

  // Swipe physics
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-220, 220], [-14, 14]);

  // ── Grade a card ──
  const handleGrade = useCallback(
    (grade: StudyGrade) => {
      if (!active || isPending) return;
      const durationMs = Date.now() - cardStart.current;

      startTransition(async () => {
        const result = await gradeCard({
          card_id: active.id,
          deck_id: deckId,
          grade,
          duration_ms: durationMs,
        });

        if (result?.error) {
          toast.error(
            typeof result.error === 'string' ? result.error : 'Failed to save grade'
          );
          return;
        }

        setGradeLog((prev) => [...prev, grade]);
        setShowAnswer(false);
        setIndex((prev) => prev + 1);
        cardStart.current = Date.now();
      });
    },
    [active, deckId, isPending, startTransition]
  );

  const restart = () => {
    setIndex(0);
    setShowAnswer(false);
    setGradeLog([]);
    sessionStart.current = Date.now();
    cardStart.current = Date.now();
  };

  // ── Keyboard navigation ──
  useEffect(() => {
    if (completed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (!showAnswer) {
            setShowAnswer(true);
          }
          break;
        case '1':
          if (showAnswer) handleGrade('again');
          break;
        case '2':
          if (showAnswer) handleGrade('hard');
          break;
        case '3':
          if (showAnswer) handleGrade('good');
          break;
        case '4':
          if (showAnswer) handleGrade('easy');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completed, showAnswer, handleGrade]);

  // ── Empty state ──
  if (cards.length === 0) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">You&apos;re all caught up!</h1>
          <p className="mt-2 text-muted-foreground">
            No cards are due for review right now. Come back later or add more cards.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalInDeck} card{totalInDeck !== 1 ? 's' : ''} total in this deck
          </p>
          <Link href={`/dashboard/${deckId}`} className="mt-6 inline-block">
            <Button>Back to Deck</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Session statistics ──
  const sessionDuration = Date.now() - sessionStart.current;
  const againCount = gradeLog.filter((g) => g === 'again').length;
  const hardCount = gradeLog.filter((g) => g === 'hard').length;
  const goodCount = gradeLog.filter((g) => g === 'good').length;
  const easyCount = gradeLog.filter((g) => g === 'easy').length;

  return (
    <div className="container mx-auto space-y-6 p-6 md:p-8 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/dashboard/${deckId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Deck
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{deckTitle}</span>
          <span className="flex items-center gap-1 text-xs">
            <Timer className="h-3 w-3" />
            {formatDuration(Date.now() - sessionStart.current)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completed ? 'Session complete' : `Card ${index + 1} of ${cards.length}`}
          </span>
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

      {/* Live region for screen reader */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {completed
          ? `Study session complete. ${gradeLog.length} cards reviewed.`
          : `Card ${index + 1} of ${cards.length}. ${showAnswer ? 'Answer: ' + active.back : 'Question: ' + active.front}`}
      </div>

      <AnimatePresence mode="wait">
        {completed ? (
          /* ═══════════ SESSION SUMMARY ═══════════ */
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="mx-auto max-w-2xl space-y-6"
          >
            {/* Header */}
            <div className="glass-card glow-border rounded-3xl p-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                <Flame className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Session Complete!</h2>
              <p className="mt-1 text-muted-foreground">
                You reviewed {gradeLog.length} card{gradeLog.length !== 1 ? 's' : ''} in{' '}
                {formatDuration(sessionDuration)}
              </p>
            </div>

            {/* Grade breakdown */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Again', count: againCount, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                { label: 'Hard', count: hardCount, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                { label: 'Good', count: goodCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { label: 'Easy', count: easyCount, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-2xl border ${stat.border} ${stat.bg} p-4 text-center`}
                >
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            <div className="glass-card rounded-2xl divide-y divide-primary/10">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  Session Duration
                </span>
                <span className="text-sm font-medium">{formatDuration(sessionDuration)}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  Avg. per Card
                </span>
                <span className="text-sm font-medium">
                  {gradeLog.length > 0
                    ? formatDuration(Math.round(sessionDuration / gradeLog.length))
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Retention Rate
                </span>
                <span className="text-sm font-medium">
                  {gradeLog.length > 0
                    ? `${Math.round(((goodCount + easyCount) / gradeLog.length) * 100)}%`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3">
              <Button onClick={restart} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Study Again
              </Button>
              <Link href={`/dashboard/${deckId}`}>
                <Button className="gap-2">
                  Back to Deck
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        ) : (
          /* ═══════════ ACTIVE STUDY CARD ═══════════ */
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
                drag={showAnswer ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                style={{ x: dragX, rotate }}
                onDragEnd={(_, info) => {
                  if (showAnswer) {
                    if (info.offset.x > 120) handleGrade('good');
                    else if (info.offset.x < -120) handleGrade('again');
                  }
                }}
                whileTap={{ scale: 0.995 }}
                className="glass-card glow-border absolute inset-0 cursor-grab rounded-3xl p-7 active:cursor-grabbing"
              >
                {/* State badge */}
                <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Card {index + 1} of {cards.length}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      showAnswer
                        ? 'bg-neon/10 text-neon border border-neon/20'
                        : 'bg-primary/10 text-primary border border-primary/20'
                    }`}
                  >
                    {showAnswer ? 'Answer' : 'Question'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!showAnswer) setShowAnswer(true);
                  }}
                  className="flex h-[13rem] w-full items-center justify-center overflow-y-auto rounded-2xl border border-primary/15 bg-background/25 px-6 text-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background/0"
                  aria-label={
                    showAnswer
                      ? 'Showing answer. Choose a grade below.'
                      : 'Showing question. Press to reveal answer.'
                  }
                >
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={showAnswer ? 'answer' : 'question'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="text-lg leading-relaxed line-clamp-6"
                    >
                      {showAnswer ? active.back : active.front}
                    </motion.p>
                  </AnimatePresence>
                </button>
              </motion.div>
            </div>

            {/* Grade buttons — only show when answer is revealed */}
            <AnimatePresence>
              {showAnswer ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                  className="grid grid-cols-4 gap-2"
                >
                  {GRADE_BUTTONS.map((btn) => (
                    <button
                      key={btn.grade}
                      type="button"
                      onClick={() => handleGrade(btn.grade)}
                      disabled={isPending}
                      className={`flex flex-col items-center gap-1 rounded-xl border ${btn.borderColor} ${btn.bgColor} px-3 py-3 transition-all duration-150 disabled:opacity-50`}
                    >
                      <span className={`text-sm font-semibold ${btn.color}`}>
                        {btn.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {btn.key}
                      </span>
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center"
                >
                  <Button
                    onClick={() => setShowAnswer(true)}
                    className="w-full max-w-xs"
                  >
                    Show Answer
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Keyboard hint */}
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/70">
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Keyboard className="h-3.5 w-3.5" />
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">
                  Space
                </kbd>{' '}
                reveal
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">
                  1-4
                </kbd>{' '}
                grade
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
