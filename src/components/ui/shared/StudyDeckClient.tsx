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
import { enrichCards, gradeCard } from '@/app/actions';
import { IdentificationMode } from '@/components/ui/shared/IdentificationMode';
import { MCQMode } from '@/components/ui/shared/MCQMode';
import { StudyModeSelector } from '@/components/ui/shared/StudyModeSelector';
import type { StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { toast } from 'sonner';

type StudyMode = 'flashcard' | 'identification' | 'mcq';

export type StudyCard = {
  id: string;
  front: string;
  back: string;
  state: CardState;
  interval: number;
  ease_factor: number;
  repetition_count: number;
  mcq_distractors: string[] | null;
  id_question: string | null;
};

type StudyDeckClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudyCard[];
  totalInDeck: number;
};

const GRADE_BUTTONS: {
  grade: StudyGrade;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  key: string;
}[] = [
  {
    grade: 'again',
    label: 'Again',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 hover:bg-red-500/20',
    borderColor: 'border-red-500/20',
    key: '1',
  },
  {
    grade: 'hard',
    label: 'Hard',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 hover:bg-orange-500/20',
    borderColor: 'border-orange-500/20',
    key: '2',
  },
  {
    grade: 'good',
    label: 'Good',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    borderColor: 'border-emerald-500/20',
    key: '3',
  },
  {
    grade: 'easy',
    label: 'Easy',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 hover:bg-sky-500/20',
    borderColor: 'border-sky-500/20',
    key: '4',
  },
];

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

export function StudyDeckClient({
  deckId,
  deckTitle,
  cards,
  totalInDeck,
}: StudyDeckClientProps) {
  const [sessionStartMs, setSessionStartMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sessionCards, setSessionCards] = useState(cards);
  const [studyMode, setStudyMode] = useState<StudyMode>('flashcard');
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [gradeLog, setGradeLog] = useState<StudyGrade[]>([]);
  const [identificationScoreLog, setIdentificationScoreLog] = useState<number[]>([]);
  const [mcqResultLog, setMcqResultLog] = useState<boolean[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isEnriching, startEnrichmentTransition] = useTransition();

  const cardStart = useRef(sessionStartMs);
  const requestedEnrichmentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setSessionCards(cards);
  }, [cards]);

  const active = sessionCards[index];
  const next = sessionCards[index + 1];
  const completed = index >= sessionCards.length;

  const progress = useMemo(() => {
    if (sessionCards.length === 0) return 0;
    return Math.round(((completed ? sessionCards.length : index) / sessionCards.length) * 100);
  }, [completed, index, sessionCards.length]);

  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-220, 220], [-14, 14]);

  const applyEnrichment = useCallback((rows: Array<{ id: string; mcq_distractors: string[]; id_question: string }>) => {
    if (rows.length === 0) {
      return;
    }

    setSessionCards((current) =>
      current.map((card) => {
        const match = rows.find((row) => row.id === card.id);
        if (!match) {
          return card;
        }

        return {
          ...card,
          mcq_distractors: match.mcq_distractors,
          id_question: match.id_question,
        };
      })
    );
  }, []);

  const requestEnrichment = useCallback(
    (mode: StudyMode) => {
      if (mode === 'flashcard') {
        return;
      }

      const missingIds = sessionCards
        .filter((card) => {
          if (requestedEnrichmentIds.current.has(card.id)) {
            return false;
          }

          if (mode === 'identification') {
            return !card.id_question;
          }

          return !Array.isArray(card.mcq_distractors) || card.mcq_distractors.length < 2;
        })
        .slice(0, 20)
        .map((card) => card.id);

      if (missingIds.length === 0) {
        return;
      }

      missingIds.forEach((id) => requestedEnrichmentIds.current.add(id));

      startEnrichmentTransition(async () => {
        const result = await enrichCards({ deck_id: deckId, card_ids: missingIds });
        if (result?.error) {
          toast.error(typeof result.error === 'string' ? result.error : 'Failed to prepare quiz data');
          return;
        }

        applyEnrichment(result?.cards ?? []);
      });
    },
    [applyEnrichment, deckId, sessionCards]
  );

  useEffect(() => {
    requestEnrichment(studyMode);
  }, [studyMode, requestEnrichment]);

  const commitGrade = useCallback(
    (grade: StudyGrade, extras?: { similarityScore?: number; mcqCorrect?: boolean }) => {
      if (!active || isPending) return;
      const durationMs = Date.now() - cardStart.current;

      startTransition(async () => {
        const similarityScore = extras?.similarityScore;
        const mcqCorrect = extras?.mcqCorrect;
        const result = await gradeCard({
          card_id: active.id,
          deck_id: deckId,
          grade,
          duration_ms: durationMs,
        });

        if (result?.error) {
          toast.error(typeof result.error === 'string' ? result.error : 'Failed to save grade');
          return;
        }

        setGradeLog((prev) => [...prev, grade]);
        if (typeof similarityScore === 'number') {
          setIdentificationScoreLog((prev) => [...prev, similarityScore]);
        }
        if (typeof mcqCorrect === 'boolean') {
          setMcqResultLog((prev) => [...prev, mcqCorrect]);
        }
        setShowAnswer(false);
        setIndex((prev) => prev + 1);
        cardStart.current = Date.now();
        setNowMs(Date.now());
      });
    },
    [active, deckId, isPending, startTransition]
  );

  const restart = () => {
    const nextNow = Date.now();
    setIndex(0);
    setShowAnswer(false);
    setGradeLog([]);
    setIdentificationScoreLog([]);
    setMcqResultLog([]);
    setSessionStartMs(nextNow);
    setNowMs(nextNow);
    cardStart.current = nextNow;
  };

  useEffect(() => {
    if (completed || studyMode !== 'flashcard') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (!showAnswer) {
            setShowAnswer(true);
          }
          break;
        case '1':
          if (showAnswer) commitGrade('again');
          break;
        case '2':
          if (showAnswer) commitGrade('hard');
          break;
        case '3':
          if (showAnswer) commitGrade('good');
          break;
        case '4':
          if (showAnswer) commitGrade('easy');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitGrade, completed, showAnswer, studyMode]);

  if (sessionCards.length === 0) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
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

  const sessionDuration = nowMs - sessionStartMs;
  const againCount = gradeLog.filter((grade) => grade === 'again').length;
  const hardCount = gradeLog.filter((grade) => grade === 'hard').length;
  const goodCount = gradeLog.filter((grade) => grade === 'good').length;
  const easyCount = gradeLog.filter((grade) => grade === 'easy').length;
  const activeNeedsIdentificationPrompt = Boolean(active && !active.id_question);
  const activeNeedsMcq = Boolean(
    active && (!Array.isArray(active.mcq_distractors) || active.mcq_distractors.length < 2)
  );

  return (
    <div className="container mx-auto space-y-6 p-6 pb-28 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/dashboard/${deckId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Deck
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{deckTitle}</span>
          <span className="flex items-center gap-1 text-xs">
            <Timer className="h-3 w-3" />
            {formatDuration(nowMs - sessionStartMs)}
          </span>
        </div>
      </div>

      <StudyModeSelector value={studyMode} onValueChange={setStudyMode} />

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completed ? 'Session complete' : `Card ${index + 1} of ${sessionCards.length}`}
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

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {completed
          ? `Study session complete. ${gradeLog.length} cards reviewed.`
          : `Card ${index + 1} of ${sessionCards.length}. Current mode ${studyMode}.`}
      </div>

      <AnimatePresence mode="wait">
        {completed ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="mx-auto max-w-2xl space-y-6"
          >
            <div className="glass-card glow-border rounded-3xl p-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Flame className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Session Complete!</h2>
              <p className="mt-1 text-muted-foreground">
                You reviewed {gradeLog.length} card{gradeLog.length !== 1 ? 's' : ''} in {formatDuration(sessionDuration)}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Again', count: againCount, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                { label: 'Hard', count: hardCount, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                { label: 'Good', count: goodCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { label: 'Easy', count: easyCount, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-2xl border ${stat.border} ${stat.bg} p-4 text-center`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

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
                  {gradeLog.length > 0 ? formatDuration(Math.round(sessionDuration / gradeLog.length)) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Retention Rate
                </span>
                <span className="text-sm font-medium">
                  {gradeLog.length > 0 ? `${Math.round(((goodCount + easyCount) / gradeLog.length) * 100)}%` : '—'}
                </span>
              </div>
              {identificationScoreLog.length > 0 ? (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-muted-foreground">Identification Avg.</span>
                  <span className="text-sm font-medium">
                    {Math.round((identificationScoreLog.reduce((sum, value) => sum + value, 0) / identificationScoreLog.length) * 100)}%
                  </span>
                </div>
              ) : null}
              {mcqResultLog.length > 0 ? (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-muted-foreground">MCQ First-Try Accuracy</span>
                  <span className="text-sm font-medium">
                    {Math.round((mcqResultLog.filter(Boolean).length / mcqResultLog.length) * 100)}%
                  </span>
                </div>
              ) : null}
            </div>

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
          <motion.div
            key={`${studyMode}-${active.id}`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="mx-auto w-full max-w-2xl space-y-4"
          >
            {studyMode === 'flashcard' ? (
              <>
                <div className="relative h-[20rem]">
                  {next ? (
                    <motion.div
                      className="glass-card absolute inset-0 rounded-3xl"
                      initial={false}
                      animate={{ scale: 0.96, y: 10, opacity: 0.55 }}
                    />
                  ) : null}

                  <motion.div
                    drag={showAnswer ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    style={{ x: dragX, rotate }}
                    onDragEnd={(_, info) => {
                      if (showAnswer) {
                        if (info.offset.x > 120) commitGrade('good');
                        else if (info.offset.x < -120) commitGrade('again');
                      }
                    }}
                    whileTap={{ scale: 0.995 }}
                    className="glass-card glow-border absolute inset-0 cursor-grab rounded-3xl p-7 active:cursor-grabbing"
                  >
                    <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                      <span>Card {index + 1} of {sessionCards.length}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${showAnswer ? 'border-neon/20 bg-neon/10 text-neon' : 'border-primary/20 bg-primary/10 text-primary'}`}>
                        {showAnswer ? 'Answer' : 'Question'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!showAnswer) setShowAnswer(true);
                      }}
                      className="flex h-[13rem] w-full items-center justify-center overflow-y-auto rounded-2xl border border-primary/15 bg-background/25 px-6 text-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background/0"
                      aria-label={showAnswer ? 'Showing answer. Choose a grade below.' : 'Showing question. Press to reveal answer.'}
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

                <AnimatePresence>
                  {showAnswer ? (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      className="grid grid-cols-4 gap-2"
                    >
                      {GRADE_BUTTONS.map((button) => (
                        <button
                          key={button.grade}
                          type="button"
                          onClick={() => commitGrade(button.grade)}
                          disabled={isPending}
                          className={`flex flex-col items-center gap-1 rounded-xl border ${button.borderColor} ${button.bgColor} px-3 py-3 transition-all duration-150 disabled:opacity-50`}
                        >
                          <span className={`text-sm font-semibold ${button.color}`}>{button.label}</span>
                          <span className="text-[10px] text-muted-foreground">{button.key}</span>
                        </button>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
                      <Button onClick={() => setShowAnswer(true)} className="w-full max-w-xs">
                        Show Answer
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : null}

            {studyMode === 'identification' ? (
              <IdentificationMode
                key={active.id}
                deckId={deckId}
                card={active}
                disabled={isPending}
                enrichmentPending={isEnriching && activeNeedsIdentificationPrompt}
                onResolve={(grade, score) => commitGrade(grade, { similarityScore: score })}
              />
            ) : null}

            {studyMode === 'mcq' ? (
              <MCQMode
                key={active.id}
                card={active}
                disabled={isPending}
                enrichmentPending={isEnriching && activeNeedsMcq}
                onResolve={(grade, wasCorrect) => commitGrade(grade, { mcqCorrect: wasCorrect })}
                onFallbackToIdentification={() => setStudyMode('identification')}
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/70">
              {studyMode === 'flashcard' ? (
                <>
                  <span className="hidden sm:inline-flex items-center gap-1.5">
                    <Keyboard className="h-3.5 w-3.5" />
                    <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>
                    reveal
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1.5">
                    <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">1-4</kbd>
                    grade
                  </span>
                </>
              ) : null}
              {studyMode === 'identification' ? (
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                  check answer
                </span>
              ) : null}
              {studyMode === 'mcq' ? (
                <span className="inline-flex items-center gap-1.5">
                  Quiz distractors are AI-generated per card and shuffled locally.
                </span>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
