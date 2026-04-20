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
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { gradeCard } from '@/app/actions';
import type { StudyGrade } from '@/lib/sm2';
import type { StudyScope, StudySessionCard } from '@/lib/study';
import { toast } from 'sonner';

type FlashcardReviewClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudySessionCard[];
  totalInDeck: number;
  studyScope: StudyScope;
};

type GradeLogEntry = {
  cardId: string;
  grade: StudyGrade;
};

type PersistedStudySessionState = {
  version: 3;
  sourceCardIds: string[];
  queueCardIds: string[];
  index: number;
  showAnswer: boolean;
  gradeLog: GradeLogEntry[];
  sessionDurationMs: number;
};

const STUDY_SESSION_STATE_VERSION = 3;

const REQUEUE_DELAY_MS: Record<StudyGrade, number | null> = {
  again: 2 * 60_000,
  hard: 6 * 60_000,
  good: null,
  easy: null,
};

const MIN_REQUEUE_OFFSET = 1;
const MAX_REQUEUE_OFFSET = 15;
const MIN_ASSUMED_MS_PER_CARD = 8_000;

const GRADE_BUTTONS: {
  grade: StudyGrade;
  label: string;
  hint: string;
  color: string;
  bgColor: string;
  borderColor: string;
  key: string;
}[] = [
  {
    grade: 'again',
    label: 'Again',
    hint: '~2m',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 hover:bg-red-500/20',
    borderColor: 'border-red-500/20',
    key: '1',
  },
  {
    grade: 'hard',
    label: 'Hard',
    hint: '~6m',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 hover:bg-orange-500/20',
    borderColor: 'border-orange-500/20',
    key: '2',
  },
  {
    grade: 'good',
    label: 'Good',
    hint: 'done',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    borderColor: 'border-emerald-500/20',
    key: '3',
  },
  {
    grade: 'easy',
    label: 'Easy',
    hint: 'done',
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

function isStudyGrade(value: unknown): value is StudyGrade {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
}

export function FlashcardReviewClient({
  deckId,
  deckTitle,
  cards,
  totalInDeck,
  studyScope,
}: FlashcardReviewClientProps) {
  const router = useRouter();
  const sessionCardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const storageKey = useMemo(
    () => `study-session:${deckId}:${studyScope}:${sessionCardIds.join('|')}`,
    [deckId, sessionCardIds, studyScope]
  );
  const cardsById = useMemo(() => {
    const map = new Map<string, StudySessionCard>();
    cards.forEach((card) => {
      map.set(card.id, card);
    });
    return map;
  }, [cards]);
  const [sessionStartMs, setSessionStartMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sessionCards, setSessionCards] = useState(cards);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [gradeLog, setGradeLog] = useState<GradeLogEntry[]>([]);
  const [resumeState, setResumeState] = useState<PersistedStudySessionState | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as PersistedStudySessionState;
      const hasMatchingSourceCards =
        Array.isArray(parsed.sourceCardIds) &&
        parsed.sourceCardIds.length === sessionCardIds.length &&
        parsed.sourceCardIds.every((id, cardIndex) => id === sessionCardIds[cardIndex]);
      const queueLength = Array.isArray(parsed.queueCardIds) ? parsed.queueCardIds.length : 0;
      const hasValidQueue =
        Array.isArray(parsed.queueCardIds) &&
        parsed.queueCardIds.length > 0 &&
        parsed.queueCardIds.every((id) => cardsById.has(id));
      const hasValidIndex = Number.isInteger(parsed.index) && parsed.index > 0 && parsed.index < queueLength;
      const hasValidDuration = Number.isFinite(parsed.sessionDurationMs) && parsed.sessionDurationMs >= 0;
      const hasValidGradeLog =
        Array.isArray(parsed.gradeLog) &&
        parsed.gradeLog.length <= parsed.index &&
        parsed.gradeLog.every((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }

          const cardId = 'cardId' in entry ? entry.cardId : null;
          const grade = 'grade' in entry ? entry.grade : null;
          return typeof cardId === 'string' && cardsById.has(cardId) && isStudyGrade(grade);
        });

      if (
        parsed.version !== STUDY_SESSION_STATE_VERSION ||
        !hasMatchingSourceCards ||
        !hasValidQueue ||
        !hasValidIndex ||
        !hasValidDuration ||
        !hasValidGradeLog
      ) {
        window.sessionStorage.removeItem(storageKey);
        return null;
      }

      return parsed;
    } catch {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
  });
  const [isPending, startTransition] = useTransition();
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);

  const cardStart = useRef(sessionStartMs);
  const active = sessionCards[index];
  const next = sessionCards[index + 1];
  const completed = index >= sessionCards.length;

  useEffect(() => {
    if (resumeState || completed) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [completed, resumeState]);

  useEffect(() => {
    if (!completed || resumeState) {
      return;
    }

    // Freeze session duration at completion time.
    setNowMs(Date.now());
  }, [completed, resumeState]);

  const progress = useMemo(() => {
    if (sessionCards.length === 0) return 0;
    return Math.round(((completed ? sessionCards.length : index) / sessionCards.length) * 100);
  }, [completed, index, sessionCards.length]);

  const summaryGrades = useMemo(() => {
    const latestGradeByCard = new Map<string, StudyGrade>();
    gradeLog.forEach((entry) => {
      latestGradeByCard.set(entry.cardId, entry.grade);
    });

    return sessionCardIds
      .map((cardId) => latestGradeByCard.get(cardId))
      .filter((grade): grade is StudyGrade => Boolean(grade));
  }, [gradeLog, sessionCardIds]);

  const reviewedCardCount = summaryGrades.length;
  const againCount = summaryGrades.filter((grade) => grade === 'again').length;
  const hardCount = summaryGrades.filter((grade) => grade === 'hard').length;
  const goodCount = summaryGrades.filter((grade) => grade === 'good').length;
  const easyCount = summaryGrades.filter((grade) => grade === 'easy').length;

  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-220, 220], [-14, 14]);

  const insertRequeueCard = useCallback(
    (
      currentCards: StudySessionCard[],
      currentIndex: number,
      card: StudySessionCard,
      grade: StudyGrade,
      averageMsPerCard: number
    ) => {
      const delayMs = REQUEUE_DELAY_MS[grade];
      if (delayMs === null) {
        return currentCards;
      }

      const rawOffset = Math.ceil(delayMs / Math.max(averageMsPerCard, MIN_ASSUMED_MS_PER_CARD));
      const offset = Math.max(MIN_REQUEUE_OFFSET, Math.min(rawOffset, MAX_REQUEUE_OFFSET));

      const insertIndex = Math.min(currentCards.length, currentIndex + offset + 1);
      const nextCards = [...currentCards];
      nextCards.splice(insertIndex, 0, card);
      return nextCards;
    },
    []
  );

  const commitGrade = useCallback(
    (grade: StudyGrade) => {
      if (!active || isPending || isSubmittingGrade) return;
      const durationMs = Date.now() - cardStart.current;
      const previousCards = sessionCards;
      const previousIndex = index;
      const previousShowAnswer = showAnswer;
      const elapsedSessionMs = Math.max(Date.now() - sessionStartMs, MIN_ASSUMED_MS_PER_CARD);
      const reviewedCardsCount = Math.max(previousIndex + 1, 1);
      const averageMsPerCard = Math.max(MIN_ASSUMED_MS_PER_CARD, elapsedSessionMs / reviewedCardsCount);
      const nextCards = insertRequeueCard(previousCards, previousIndex, active, grade, averageMsPerCard);
      setIsSubmittingGrade(true);

      // Optimistically advance to the next card for snappier grading UX.
      setSessionCards(nextCards);
      setGradeLog((prev) => [...prev, { cardId: active.id, grade }]);
      setShowAnswer(false);
      setIndex((prev) => prev + 1);
      cardStart.current = Date.now();
      setNowMs(Date.now());

      startTransition(async () => {
        try {
          const result = await gradeCard({
            card_id: active.id,
            deck_id: deckId,
            grade,
            duration_ms: durationMs,
          });

          if (result?.error) {
            toast.error(typeof result.error === 'string' ? result.error : 'Failed to save grade');

            // Roll back optimistic UI progression when persistence fails.
            setSessionCards(previousCards);
            setIndex(previousIndex);
            setShowAnswer(previousShowAnswer);
            setGradeLog((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
            cardStart.current = Date.now();
            setNowMs(Date.now());
            return;
          }
        } catch (error) {
          console.error('[FlashcardReviewClient] gradeCard failed:', error);
          toast.error('Failed to save card grade. Please try again.');

          setSessionCards(previousCards);
          setIndex(previousIndex);
          setShowAnswer(previousShowAnswer);
          setGradeLog((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
          cardStart.current = Date.now();
          setNowMs(Date.now());
        } finally {
          setIsSubmittingGrade(false);
        }
      });
    },
    [
      active,
      deckId,
      index,
      insertRequeueCard,
      isPending,
      isSubmittingGrade,
      sessionCards,
      sessionStartMs,
      showAnswer,
      startTransition,
    ]
  );

  const clearStoredProgress = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  const startNewSession = useCallback(() => {
    clearStoredProgress();
    const nextNow = Date.now();
    setSessionCards(cards);
    setIndex(0);
    setShowAnswer(false);
    setGradeLog([]);
    setResumeState(null);
    setSessionStartMs(nextNow);
    setNowMs(nextNow);
    cardStart.current = nextNow;
  }, [cards, clearStoredProgress]);

  const resumePreviousSession = useCallback(() => {
    if (!resumeState) {
      return;
    }

    const restoredSessionCards = resumeState.queueCardIds
      .map((cardId) => cardsById.get(cardId))
      .filter((card): card is StudySessionCard => Boolean(card));

    if (restoredSessionCards.length === 0) {
      toast.error('Saved review session is no longer available. Starting a new session.');
      startNewSession();
      return;
    }

    const nextNow = Date.now();
    const safeIndex = Math.max(0, Math.min(resumeState.index, restoredSessionCards.length - 1));

    setSessionCards(restoredSessionCards);
    setIndex(safeIndex);
    setShowAnswer(Boolean(resumeState.showAnswer));
    setGradeLog(resumeState.gradeLog.slice(0, safeIndex));
    setSessionStartMs(nextNow - Math.max(0, resumeState.sessionDurationMs));
    setNowMs(nextNow);
    setResumeState(null);
    cardStart.current = nextNow;
    toast.success('Resumed previous study session');
  }, [cardsById, resumeState, startNewSession]);

  const restart = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  const saveAndExit = useCallback(() => {
    clearStoredProgress();

    if (reviewedCardCount > 0) {
      toast.success(`Saved progress for ${reviewedCardCount} card${reviewedCardCount !== 1 ? 's' : ''}.`);
    } else {
      toast.success('Session closed. You can continue reviewing anytime.');
    }

    router.push(`/dashboard/${deckId}`);
  }, [clearStoredProgress, deckId, reviewedCardCount, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || resumeState) {
      return;
    }

    if (sessionCards.length === 0 || completed) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    const payload: PersistedStudySessionState = {
      version: STUDY_SESSION_STATE_VERSION,
      sourceCardIds: sessionCardIds,
      queueCardIds: sessionCards.map((card) => card.id),
      index,
      showAnswer,
      gradeLog,
      sessionDurationMs: Math.max(0, nowMs - sessionStartMs),
    };

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [completed, gradeLog, index, nowMs, resumeState, sessionCardIds, sessionCards, sessionStartMs, showAnswer, storageKey]);

  useEffect(() => {
    if (completed || resumeState) return;

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
  }, [commitGrade, completed, resumeState, showAnswer]);

  useEffect(() => {
    if (completed || resumeState || sessionCards.length === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [completed, resumeState, sessionCards.length]);

  if (sessionCards.length === 0) {
    const emptyMessage = studyScope === 'unmastered_only'
      ? 'No unmastered cards are left in this deck right now.'
      : "No cards are due for review right now. Come back later or add more cards.";

    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">You&apos;re all caught up!</h1>
          <p className="mt-2 text-muted-foreground">
            {emptyMessage}
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

  if (resumeState) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Resume your previous session?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick up from card {Math.min(resumeState.index + 1, resumeState.queueCardIds.length)} of {resumeState.queueCardIds.length}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last recorded progress: {formatDuration(resumeState.sessionDurationMs)} of active study time.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={startNewSession} variant="outline">Start New Session</Button>
            <Button onClick={resumePreviousSession}>Resume Session</Button>
          </div>

          <Link href={`/dashboard/${deckId}`} className="mt-4 inline-block">
            <Button variant="ghost">Back to Deck</Button>
          </Link>
        </div>
      </div>
    );
  }

  const sessionDuration = nowMs - sessionStartMs;

  return (
    <div className="container mx-auto space-y-6 p-6 pb-28 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={saveAndExit}
          disabled={isPending || isSubmittingGrade}
          className="inline-flex items-center gap-2 px-0 text-sm text-muted-foreground hover:bg-transparent hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Save & Exit
        </Button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{deckTitle}</span>
          <span className="flex items-center gap-1 text-xs">
            <Timer className="h-3 w-3" />
            {formatDuration(nowMs - sessionStartMs)}
          </span>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completed ? 'Review complete' : `Card ${index + 1} of ${sessionCards.length}`}
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
          ? `Flashcard review complete. ${reviewedCardCount} cards reviewed.`
          : `Card ${index + 1} of ${sessionCards.length}.`}
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
              <h2 className="text-2xl font-bold tracking-tight">Review Complete</h2>
              <p className="mt-1 text-muted-foreground">
                You reviewed {reviewedCardCount} card{reviewedCardCount !== 1 ? 's' : ''} in {formatDuration(sessionDuration)}.
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
                  {reviewedCardCount > 0 ? formatDuration(Math.round(sessionDuration / reviewedCardCount)) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Retention Rate
                </span>
                <span className="text-sm font-medium">
                  {reviewedCardCount > 0 ? `${Math.round(((goodCount + easyCount) / reviewedCardCount) * 100)}%` : '—'}
                </span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <Button onClick={restart} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Review Again
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
            key={active.id}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="mx-auto w-full max-w-2xl space-y-4"
          >
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
                      {showAnswer ? active.front : active.back}
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
                  className="space-y-3"
                >
                  {active.mnemonic ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-muted-foreground">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Memory Aid</p>
                      <p className="mt-1 leading-relaxed">{active.mnemonic}</p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-4 gap-2">
                    {GRADE_BUTTONS.map((button) => (
                      <button
                        key={button.grade}
                        type="button"
                        onClick={() => commitGrade(button.grade)}
                        disabled={isPending || isSubmittingGrade}
                        className={`flex flex-col items-center gap-1 rounded-xl border ${button.borderColor} ${button.bgColor} px-3 py-3 transition-all duration-150 disabled:opacity-50`}
                      >
                        <span className={`text-sm font-semibold ${button.color}`}>{button.label}</span>
                        <span className="text-[10px] text-muted-foreground">{button.key} · {button.hint}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
                  <Button onClick={() => setShowAnswer(true)} className="w-full max-w-xs">
                    Show Answer
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/70">
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Keyboard className="h-3.5 w-3.5" />
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>
                reveal
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <kbd className="rounded border border-primary/15 bg-card/60 px-1.5 py-0.5 font-mono text-[10px]">1-4</kbd>
                grade
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}