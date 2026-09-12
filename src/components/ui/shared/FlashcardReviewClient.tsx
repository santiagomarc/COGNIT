'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { m, AnimatePresence, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { ArrowLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { FlipCard, type FlipState } from '@/components/ui/shared/FlipCard';
import { GradeKey } from '@/components/ui/shared/GradeKey';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { StudyCapstoneOffer, type CapstoneOffer } from '@/components/ui/shared/synthesis/StudyCapstoneOffer';
import { gradeCard, finishStudySession } from '@/app/actions/study';
import { cardLeaveSpring, motionTransitions } from '@/lib/motion-configs';
import { DEFAULT_EASE_FACTOR, type SM2Input, type StudyGrade } from '@/lib/sm2';
import { summariseNextReviews, type StudyScope, type StudySessionCard } from '@/lib/study';
import { pickCapstoneDrill } from '@/lib/synthesis/schedule';
import type { CapstoneDrillCandidate } from '@/lib/synthesis/types';
import { toast } from 'sonner';

type FlashcardReviewClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudySessionCard[];
  totalInDeck: number;
  studyScope: StudyScope;
  /**
   * The deck's active synthesis drills, lean. The completed state offers one
   * of them as a capstone when the session warmed its anchors (spec §8.3).
   */
  capstoneDrills?: CapstoneDrillCandidate[];
};

const NO_DRILLS: CapstoneDrillCandidate[] = [];

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

/**
 * The order the keys sit in, left to right. Colour, label, keycap digit and the
 * projected interval all come from `GradeKey` (design system §7.4) — including
 * the deliberate asymmetry that easy is colourless. The four hand-picked
 * Tailwind ramps that used to live here (with a sky-blue "easy" that §2.2
 * forbids outright) are gone.
 */
const GRADE_ORDER: StudyGrade[] = ['again', 'hard', 'good', 'easy'];

/**
 * How long the card wears its grade before it leaves the stack (§7.6). Short
 * enough to stay out of the way of a fast grader, long enough that the commit
 * is acknowledged rather than silently swallowed.
 */
const COMMIT_FLASH_MS = 160;

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
  capstoneDrills = NO_DRILLS,
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
  /*
   * A peek back at the question after the answer is up. It is distinct from
   * `showAnswer` on purpose: `showAnswer` arms the grade deck and must not be
   * un-armed by looking at the prompt again, and keeping the reveal control
   * mounted in both states is what stops the action band from collapsing (and
   * shifting the deck) the moment a card is revealed.
   */
  const [peeking, setPeeking] = useState(false);
  /** The grade the current card is wearing during its 160ms commit flash. */
  const [committedGrade, setCommittedGrade] = useState<StudyGrade | null>(null);
  /** Mirrors a held number key onto the matching key's detent. */
  const [heldGrade, setHeldGrade] = useState<StudyGrade | null>(null);
  const [isPaused, setIsPaused] = useState(false);
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
  // gradeCard already returns nextReviewAt/interval; the client used to discard
  // them, so the summary never said when the work actually pays off.
  const [scheduledReviews, setScheduledReviews] = useState<string[]>([]);

  const cardStart = useRef(sessionStartMs);
  const commitTimerRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const active = sessionCards[index];
  const completed = index >= sessionCards.length;

  useEffect(() => {
    if (resumeState || completed || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [completed, isPaused, resumeState]);

  /*
   * `P` pauses and resumes the session (design system §7.3). The elapsed
   * readout in the telemetry header is the reason this exists: a 40-minute
   * session gets interrupted, and a clock that keeps running through the
   * interruption reports something untrue. Resuming shifts both the session
   * and per-card origins forward by the paused duration, so neither the
   * session total nor the per-card timing counts time away from the desk.
   */
  const togglePause = useCallback(() => {
    const now = Date.now();

    if (isPaused) {
      const pausedAt = pausedAtRef.current;
      pausedAtRef.current = null;

      if (pausedAt !== null) {
        const pausedFor = now - pausedAt;
        setSessionStartMs((start) => start + pausedFor);
        cardStart.current += pausedFor;
      }

      setNowMs(now);
      setIsPaused(false);
      return;
    }

    pausedAtRef.current = now;
    setNowMs(now);
    setIsPaused(true);
  }, [isPaused]);

  /* A pending commit flash must not fire into an unmounted tree. */
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
      }
    },
    []
  );

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

  const attemptGrades = useMemo(() => gradeLog.map((entry) => entry.grade), [gradeLog]);
  const reviewedAttemptCount = attemptGrades.length;
  const fallbackAttemptCount = Math.min(index, sessionCards.length);
  const effectiveAttemptCount = Math.max(reviewedAttemptCount, fallbackAttemptCount);
  const uniqueReviewedCardCount = useMemo(() => new Set(gradeLog.map((entry) => entry.cardId)).size, [gradeLog]);

  const againCount = attemptGrades.filter((grade) => grade === 'again').length;
  const hardCount = attemptGrades.filter((grade) => grade === 'hard').length;
  const goodCount = attemptGrades.filter((grade) => grade === 'good').length;
  const easyCount = attemptGrades.filter((grade) => grade === 'easy').length;

  const nextReviewSummary = useMemo(
    () => summariseNextReviews(scheduledReviews),
    [scheduledReviews],
  );

  /*
   * The capstone (spec §8.3): chosen once the session is complete, against
   * the grades it produced. `nowMs` is frozen at completion, so the choice is
   * stable across re-renders and pure — no clock read during render.
   */
  const capstoneOffer = useMemo<CapstoneOffer | null>(() => {
    if (!completed || capstoneDrills.length === 0) return null;
    const drill = pickCapstoneDrill({ drills: capstoneDrills, gradeLog, now: new Date(nowMs) });
    if (!drill) return null;
    const reviewed = new Set(gradeLog.map((entry) => entry.cardId));
    return {
      id: drill.id,
      promptText: drill.promptText,
      anchorCount: drill.cardIds.length,
      reviewedAnchorCount: drill.cardIds.filter((id) => reviewed.has(id)).length,
    };
  }, [capstoneDrills, completed, gradeLog, nowMs]);

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

  const applyGrade = useCallback(
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
      setPeeking(false);
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

          if (result?.success && typeof result.nextReviewAt === 'string') {
            setScheduledReviews((prev) => [...prev, result.nextReviewAt as string]);
          }

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

  /**
   * A graded card wears its grade for 160ms before it leaves the stack
   * (design system §7.6): the card flashes a 1px inset rule in the grade's own
   * state colour while the key it was graded with holds its detent and rolls
   * its interval. Without the pause the confirmation is drawn and destroyed in
   * the same frame, which is the same as not drawing it.
   *
   * The delay is on the card's departure, not on the user: everything the
   * grade triggers — the optimistic advance and the scheduler write — happens
   * when the flash ends, 160ms later, and the whole step is skipped outright
   * under prefers-reduced-motion.
   */
  const commitGrade = useCallback(
    (grade: StudyGrade) => {
      if (!active || isPending || isSubmittingGrade || committedGrade || isPaused) return;

      if (prefersReducedMotion) {
        applyGrade(grade);
        return;
      }

      setCommittedGrade(grade);
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null;
        setCommittedGrade(null);
        applyGrade(grade);
      }, COMMIT_FLASH_MS);
    },
    [active, applyGrade, committedGrade, isPaused, isPending, isSubmittingGrade, prefersReducedMotion]
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
    setPeeking(false);
    setCommittedGrade(null);
    setIsPaused(false);
    pausedAtRef.current = null;
    setGradeLog([]);
    setScheduledReviews([]);
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
    setPeeking(false);
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

  const saveAndExit = useCallback(async () => {
    clearStoredProgress();

    if (effectiveAttemptCount > 0) {
      toast.success(`Saved progress for ${effectiveAttemptCount} review${effectiveAttemptCount !== 1 ? 's' : ''}.`);
    } else {
      toast.success('Session closed. You can continue reviewing anytime.');
    }

    try {
      await finishStudySession(deckId);
    } catch {
      // Best-effort cache invalidation
    }
    router.push(`/dashboard/${deckId}`);
  }, [clearStoredProgress, deckId, effectiveAttemptCount, router]);

  useEffect(() => {
    if (completed) {
      finishStudySession(deckId).catch(() => {});
    }
  }, [completed, deckId]);

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

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePause();
        return;
      }

      // Everything else is suspended while the session is on hold — the point
      // of the pause is that the user is not at the desk.
      if (isPaused) return;

      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (!showAnswer) {
            setShowAnswer(true);
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          if (!showAnswer) break;
          const grade = GRADE_ORDER[Number(event.key) - 1];
          event.preventDefault();
          // The key the user is holding wears the same detent as one pressed
          // with a mouse, so the keyboard path is not the silent one.
          setHeldGrade(grade);
          commitGrade(grade);
          break;
        }
      }
    };

    const handleKeyUp = () => setHeldGrade(null);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [commitGrade, completed, isPaused, resumeState, showAnswer, togglePause]);

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

  const sessionDuration = nowMs - sessionStartMs;

  /**
   * The card's scheduling state, in the shape the scheduler speaks. Each grade
   * key runs the real SM-2 projection off this, so the consequence of a press
   * is on the key before the user commits to it — the hints it replaces were
   * the string literals `~2m`, `~6m` and `done`, which drifted from what the
   * algorithm actually did the moment a card left its learning steps.
   */
  const activeSm2: SM2Input = {
    repetitionCount: active?.repetition_count ?? 0,
    easeFactor: active?.ease_factor ?? DEFAULT_EASE_FACTOR,
    interval: active?.interval ?? 0,
    state: active?.state ?? 'new',
  };

  /**
   * One attribute drives the card (§7.6). `graded` outranks the rest: a card
   * being committed is answer-side whatever the user was last looking at.
   */
  const flipState: FlipState = committedGrade
    ? 'graded'
    : showAnswer && !peeking
      ? 'flipping'
      : 'default';

  function handleCardActivate() {
    if (isPaused) return;

    if (!showAnswer) {
      setShowAnswer(true);
      return;
    }

    setPeeking((value) => !value);
  }

  if (sessionCards.length === 0) {
    const emptyMessage = studyScope === 'unmastered_only'
      ? 'No unmastered cards are left in this deck right now.'
      : "No cards are due for review right now. Come back later or add more cards.";

    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="surface mx-auto max-w-2xl p-10 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Study
          </p>
          <h1 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance">You&apos;re all caught up!</h1>
          <p className="mt-2 text-muted-foreground">
            {emptyMessage}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalInDeck} card{totalInDeck !== 1 ? 's' : ''} total in this deck
          </p>

          {totalInDeck > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link href={`/dashboard/${deckId}/quiz?count=10&mode=mcq`}>Take a quiz instead</Link>
              </Button>
              <Button asChild>
                <Link href={`/dashboard/${deckId}/study?count=10&scope=include_reviewed`}>
                  Study ahead anyway
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/dashboard/${deckId}`}>Back to Deck</Link>
              </Button>
            </div>
          ) : (
            <Link href={`/dashboard/${deckId}`} className="mt-6 inline-block">
              <Button>Back to Deck</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (resumeState) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="surface mx-auto max-w-2xl p-10 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Study
          </p>
          <h1 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance">Resume your previous session?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick up from card {Math.min(resumeState.index + 1, resumeState.queueCardIds.length)} of {resumeState.queueCardIds.length}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last recorded progress: {formatDuration(resumeState.sessionDurationMs)} of active study time.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={startNewSession}>Start New Session</Button>
            <Button onClick={resumePreviousSession}>Resume Session</Button>
          </div>

          <Link href={`/dashboard/${deckId}`} className="mt-4 inline-block">
            <Button variant="ghost">Back to Deck</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      {/* Paused means paused: the page behind the scrim is inert, so keyboard
          focus cannot walk past it into the controls it is covering. */}
      <div className="flex flex-1 flex-col" inert={isPaused && !completed}>
        {/* Part 1: Session telemetry header (§7.9) */}
        <header className="flex-none p-4 md:px-8 md:pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={saveAndExit}
              disabled={isPending || isSubmittingGrade}
              className="gap-2 px-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Save &amp; exit
            </Button>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* The deck name is prose, so it stays in the sans face — mono is
                  for the numbers a user reads as data (§3.2). */}
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Deck
                </span>
                <span className="max-w-[10rem] truncate text-[13px] leading-none text-ink sm:max-w-[16rem]">
                  {deckTitle}
                </span>
              </div>

              <Telemetry
                label="Card"
                value={`${Math.min(index + 1, sessionCards.length)}/${sessionCards.length}`}
              />
              <Telemetry label="Ease" value={active ? active.ease_factor.toFixed(2) : '—'} />
              <Telemetry label="Elapsed" value={formatDuration(sessionDuration)} />

              {/* The keycap is bound to the control it triggers, never listed
                  in a footer strip (§7.3), and never hidden responsively. */}
              {!completed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={togglePause}
                  aria-pressed={isPaused}
                  className="gap-2 px-2"
                >
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {isPaused ? 'Resume' : 'Pause'}
                  <Kbd>P</Kbd>
                </Button>
              ) : null}
            </div>
          </div>

          {/* A 1px progress rule, not an 8px pill — depth is rule weight (§4.3). */}
          <div className="h-px w-full bg-border">
            <m.div
              className="h-px bg-ink-dim"
              initial={false}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.panel}
            />
          </div>
        </header>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {completed
            ? `Flashcard review complete. ${effectiveAttemptCount} reviews completed.`
            : `Card ${index + 1} of ${sessionCards.length}.`}
        </div>

        {/* Part 2: Centered stage (§5 Task 3.2) */}
        <main className="flex flex-1 items-center justify-center p-4 md:p-8">
          <AnimatePresence mode="wait">
            {completed ? (
              <m.div
                key="summary"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.panel}
                className="mx-auto w-full max-w-2xl space-y-6"
              >
                <div className="surface p-8 text-center">
                  <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Session
                  </p>
                  <h2 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance">Review complete</h2>
                  <p className="mt-1 text-muted-foreground">
                    You reviewed {effectiveAttemptCount} attempt{effectiveAttemptCount !== 1 ? 's' : ''} across {uniqueReviewedCardCount} card{uniqueReviewedCardCount !== 1 ? 's' : ''} in {formatDuration(sessionDuration)}.
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Again', count: againCount, color: 'text-[var(--state-lapsed)]' },
                    { label: 'Hard', count: hardCount, color: 'text-[var(--state-due)]' },
                    { label: 'Good', count: goodCount, color: 'text-[var(--state-mastered)]' },
                    { label: 'Easy', count: easyCount, color: 'text-[var(--state-neutral)]' },
                  ].map((stat) => (
                    <div key={stat.label} className="surface p-4 text-center">
                      <p className={`font-mono text-2xl font-semibold tnum ${stat.color}`}>{stat.count}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="surface divide-y divide-border">
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-muted-foreground">Session duration</span>
                    <span className="font-mono text-sm font-medium tnum">{formatDuration(sessionDuration)}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-muted-foreground">Avg. per review</span>
                    <span className="font-mono text-sm font-medium tnum">
                      {effectiveAttemptCount > 0 ? formatDuration(Math.round(sessionDuration / effectiveAttemptCount)) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-muted-foreground">Retention rate</span>
                    <span className="font-mono text-sm font-medium tnum">
                      {effectiveAttemptCount > 0 ? `${Math.round(((goodCount + easyCount) / effectiveAttemptCount) * 100)}%` : '—'}
                    </span>
                  </div>

                  {nextReviewSummary ? (
                    <div className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="text-sm text-muted-foreground">Next review</span>
                      <span className="text-right font-mono text-sm font-medium tnum">{nextReviewSummary}</span>
                    </div>
                  ) : null}
                </div>

                {/* One drill on the concepts just retrieved, or nothing (§8.3). */}
                <StudyCapstoneOffer deckId={deckId} drill={capstoneOffer} />

                <div className="flex justify-center gap-3">
                  <Button onClick={restart} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Review Again
                  </Button>
                  <Button asChild variant="primary" className="gap-2">
                    <Link href={`/dashboard/${deckId}`}>
                      Back to deck
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </m.div>
            ) : (
              <m.div
                key={active.id}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={prefersReducedMotion ? { duration: 0 } : cardLeaveSpring}
                className="mx-auto w-full max-w-2xl space-y-3"
              >
                {/* Eyebrow above the card (§5 Task 3.3) */}
                <p className="text-center font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  {flipState === 'default' ? 'Question' : 'Answer'}
                </p>

                <div className="relative">
                  <m.div
                    drag={showAnswer && !isPaused ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    style={{ x: dragX, rotate }}
                    onDragEnd={(_, info) => {
                      if (showAnswer) {
                        if (info.offset.x > 120) commitGrade('good');
                        else if (info.offset.x < -120) commitGrade('again');
                      }
                    }}
                    className="relative cursor-grab active:cursor-grabbing"
                  >
                    <FlipCard
                      state={flipState}
                      grade={committedGrade ?? undefined}
                      prompt={active.id_question ?? active.back}
                      answer={active.front}
                      answerAside={
                        active.mnemonic ? (
                          <span className="flip__aside">
                            <span className="flip__aside-label">Memory aid</span>
                            {active.mnemonic}
                          </span>
                        ) : null
                      }
                      onReveal={handleCardActivate}
                      ariaLabel={
                        showAnswer
                          ? peeking
                            ? 'Showing the question again. Press to return to the answer.'
                            : 'Showing the answer. Grade it with keys 1 to 4.'
                          : 'Showing the question. Press to reveal the answer.'
                      }
                    />
                  </m.div>
                </div>

                {/* Minimal, centered reveal affordance (§5 Task 3.3) */}
                <div className="flex min-h-[38px] items-center justify-center pt-2">
                  {!showAnswer ? (
                    <button
                      type="button"
                      onClick={() => setShowAnswer(true)}
                      disabled={isPaused}
                      className="reveal-hint"
                    >
                      <Kbd>Space</Kbd>
                      <span>reveal answer</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPeeking((value) => !value)}
                      disabled={isPaused}
                      className="reveal-hint"
                    >
                      <span>{peeking ? 'Back to answer' : 'Show question'}</span>
                    </button>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </main>

        {/* Part 3: Pinned bottom grade band (§5 Task 3.2) */}
        {!completed ? (
          <footer className="grade-band">
            <div className="mx-auto w-full max-w-2xl">
              <div
                className="grade-deck"
                data-armed={showAnswer ? 'true' : 'false'}
                inert={!showAnswer || isPaused}
                aria-label="Grade this card"
              >
                {GRADE_ORDER.map((grade) => (
                  <GradeKey
                    key={grade}
                    grade={grade}
                    card={activeSm2}
                    onCommit={commitGrade}
                    disabled={!showAnswer || isPaused || isPending || isSubmittingGrade || committedGrade !== null}
                    isDown={heldGrade === grade || committedGrade === grade}
                  />
                ))}
              </div>
            </div>
          </footer>
        ) : null}
      </div>

      {/*
        The pause is what makes the `P` keycap in the header honest, and what
        makes the elapsed readout true: a 40-minute session gets interrupted,
        and a clock that runs through the interruption reports a session the
        user did not have.

        Scrim per §7.8 — `--z-overlay`, and the 4px blur that modal scrims are
        the only permitted use of in the product.
      */}
      <AnimatePresence>
        {isPaused && !completed ? (
          <m.div
            key="study-paused-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.panel}
            className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
          >
            <div className="panel mx-4 w-full max-w-md p-8 text-center">
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Session paused
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-.025em]">Timer is on hold</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your place in the deck is kept. Paused time is not counted toward the session.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" className="gap-2" onClick={togglePause} autoFocus>
                  <Play className="h-4 w-4" />
                  Resume
                  <Kbd>P</Kbd>
                </Button>
                {/* The other way out, and it still saves the session. */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={saveAndExit}
                  disabled={isPending || isSubmittingGrade}
                >
                  Save &amp; exit
                </Button>
              </div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}