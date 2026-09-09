'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Vibrate,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enrichCards } from '@/app/actions/ai-enrich';
import { logQuizResult } from '@/app/actions/quiz';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { MasteryConfetti } from '@/components/ui/shared/MasteryConfetti';
import { fireFeedback } from '@/lib/feedback-effects';
import { useFeedbackPrefs } from '@/lib/use-feedback-prefs';
import { IdentificationMode } from '@/components/ui/shared/IdentificationMode';
import { MCQMode } from '@/components/ui/shared/MCQMode';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import type { QuizMode, StudySessionCard } from '@/lib/study';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';
import { toast } from 'sonner';

type QuizAssessmentClientProps = {
  deckId: string;
  deckTitle: string;
  cards: StudySessionCard[];
  totalInDeck: number;
  mode: QuizMode;
};

type QuizQuestionResult = {
  cardId: string;
  prompt: string;
  correctAnswer: string;
  userAnswer: string;
  correct: boolean;
  score?: number;
};

type QuizBadge = {
  title: string;
  description: string;
  tone: 'emerald' | 'primary' | 'amber';
};

type PersistedQuizSessionState = {
  version: 1;
  sessionCards: StudySessionCard[];
  quizMode: QuizMode;
  index: number;
  results: QuizQuestionResult[];
  hasSavedResult: boolean;
  isRematchSession: boolean;
  isPaused: boolean;
  sessionDurationMs: number;
};

const QUIZ_SESSION_STATE_VERSION = 1;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

function getModeLabel(mode: QuizMode) {
  return mode === 'mcq' ? 'Multiple Choice' : 'Identification';
}

function getLetterGrade(percentage: number) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

export function QuizAssessmentClient({
  deckId,
  deckTitle,
  cards,
  totalInDeck,
  mode,
}: QuizAssessmentClientProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const sessionCardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const storageKey = useMemo(
    () => `quiz-session:${deckId}:${mode}:${sessionCardIds.join('|')}`,
    [deckId, mode, sessionCardIds]
  );

  const [sessionDurationMs, setSessionDurationMs] = useState(0);
  const [sessionCards, setSessionCards] = useState(cards);
  const [quizMode, setQuizMode] = useState<QuizMode>(mode);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<QuizQuestionResult[]>([]);
  const [hasSavedResult, setHasSavedResult] = useState(false);
  const [isRematchSession, setIsRematchSession] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [resumeState, setResumeState] = useState<PersistedQuizSessionState | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as PersistedQuizSessionState;
      const hasMatchingCards =
        Array.isArray(parsed.sessionCards) &&
        parsed.sessionCards.length === sessionCardIds.length &&
        parsed.sessionCards.every((card, cardIndex) => card.id === sessionCardIds[cardIndex]);
      const hasValidMode = parsed.quizMode === 'mcq' || parsed.quizMode === 'identification';
      const hasValidIndex = Number.isInteger(parsed.index) && parsed.index > 0 && parsed.index < sessionCardIds.length;
      const hasValidResults = Array.isArray(parsed.results) && parsed.results.length <= parsed.index;
      const hasValidDuration = Number.isFinite(parsed.sessionDurationMs) && parsed.sessionDurationMs >= 0;

      if (
        parsed.version !== QUIZ_SESSION_STATE_VERSION ||
        !hasMatchingCards ||
        !hasValidMode ||
        !hasValidIndex ||
        !hasValidResults ||
        !hasValidDuration ||
        parsed.hasSavedResult
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
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [pendingQuitHref, setPendingQuitHref] = useState<string | null>(null);
  const [isEnriching, startEnrichmentTransition] = useTransition();
  const [isSavingResult, startSavingResultTransition] = useTransition();

  const [feedbackPrefs, updateFeedbackPrefs] = useFeedbackPrefs();

  const handleAnswered = useCallback((wasCorrect: boolean) => {
    fireFeedback(wasCorrect ? 'correct' : 'incorrect', feedbackPrefs);
  }, [feedbackPrefs]);

  const requestedEnrichmentIds = useRef<Set<string>>(new Set());
  const didPersistResult = useRef(false);
  const lastTickMs = useRef<number | null>(null);
  const active = sessionCards[index];
  const completed = index >= sessionCards.length;
  const sessionDuration = sessionDurationMs;
  const shouldProtectProgress = !completed && sessionCards.length > 0;

  useEffect(() => {
    if (completed || isPaused || resumeState) {
      lastTickMs.current = null;
      return;
    }

    lastTickMs.current = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const previous = lastTickMs.current ?? now;
      const delta = now - previous;
      lastTickMs.current = now;
      setSessionDurationMs((current) => current + Math.max(delta, 0));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [completed, isPaused, resumeState]);

  useEffect(() => {
    if (typeof window === 'undefined' || resumeState) {
      return;
    }

    if (sessionCards.length === 0 || completed) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    const payload: PersistedQuizSessionState = {
      version: QUIZ_SESSION_STATE_VERSION,
      sessionCards,
      quizMode,
      index,
      results,
      hasSavedResult,
      isRematchSession,
      isPaused,
      sessionDurationMs,
    };

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [
    completed,
    hasSavedResult,
    index,
    isPaused,
    isRematchSession,
    quizMode,
    resumeState,
    results,
    sessionCards,
    sessionDurationMs,
    storageKey,
  ]);

  const progress = useMemo(() => {
    if (sessionCards.length === 0) return 0;
    return Math.round(((completed ? sessionCards.length : index) / sessionCards.length) * 100);
  }, [completed, index, sessionCards.length]);

  const scoreSummary = useMemo(() => {
    const correctCount = results.filter((entry) => entry.correct).length;
    const percentage = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
    return {
      correctCount,
      incorrectCount: results.length - correctCount,
      percentage,
      letterGrade: getLetterGrade(percentage),
    };
  }, [results]);

  const averagePerQuestionMs = useMemo(() => {
    if (results.length === 0) {
      return 0;
    }

    return Math.round(sessionDuration / results.length);
  }, [results.length, sessionDuration]);

  const quizBadges = useMemo(() => {
    const badges: QuizBadge[] = [];

    if (results.length === 0) {
      return badges;
    }

    if (scoreSummary.percentage === 100) {
      badges.push({
        title: 'Flawless Victory',
        description: 'Perfect score on this run.',
        tone: 'emerald',
      });
    }

    if (scoreSummary.percentage >= 80 && averagePerQuestionMs > 0 && averagePerQuestionMs <= 3000) {
      badges.push({
        title: 'Speed Demon',
        description: '80%+ accuracy with less than 3 seconds per question.',
        tone: 'primary',
      });
    }

    if (scoreSummary.percentage >= 85 && averagePerQuestionMs > 3000) {
      badges.push({
        title: 'Steady & Sure',
        description: 'Strong accuracy with deliberate pacing.',
        tone: 'amber',
      });
    }

    return badges;
  }, [averagePerQuestionMs, results.length, scoreSummary.percentage]);

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

  useEffect(() => {
    if (sessionCards.length === 0) {
      return;
    }

    const missingIds = sessionCards
      .filter((card) => {
        if (requestedEnrichmentIds.current.has(card.id)) {
          return false;
        }

        if (quizMode === 'identification') {
          return !card.id_question;
        }

        return !Array.isArray(card.mcq_distractors) || card.mcq_distractors.length < 3 || !card.id_question;
      })
      .slice(0, 50)
      .map((card) => card.id);

    if (missingIds.length === 0) {
      return;
    }

    missingIds.forEach((id) => requestedEnrichmentIds.current.add(id));

    startEnrichmentTransition(async () => {
      const result = await enrichCards({ deck_id: deckId, card_ids: missingIds });
      if (result?.error || !result?.success) {
        toast.error(formatActionError(result?.error ?? 'Failed to prepare quiz data', 'Failed to prepare quiz data'));
        return;
      }

      applyEnrichment(result.cards ?? []);
    });
  }, [applyEnrichment, deckId, quizMode, sessionCards]);

  const didCelebrate = useRef(false);
  useEffect(() => {
    if (!completed || results.length === 0 || didCelebrate.current) return;
    didCelebrate.current = true;
    fireFeedback('complete', feedbackPrefs);
  }, [completed, feedbackPrefs, results.length]);

  useEffect(() => {
    if (!completed || results.length === 0 || didPersistResult.current) {
      return;
    }

    didPersistResult.current = true;
    startSavingResultTransition(async () => {
      const saveResult = await logQuizResult({
        deck_id: deckId,
        mode: quizMode,
        duration_ms: sessionDuration,
        include_in_history: !isRematchSession,
        results: results.map((entry) => ({
          card_id: entry.cardId,
          user_answer: entry.userAnswer,
        })),
      });

      if (saveResult?.error) {
        didPersistResult.current = false;
        toast.error(formatActionError(saveResult.error, 'Failed to save quiz results'));
        return;
      }

      setHasSavedResult(true);
    });
  }, [completed, deckId, isRematchSession, quizMode, results, sessionDuration]);

  useEffect(() => {
    if (!shouldProtectProgress) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [shouldProtectProgress]);

  useEffect(() => {
    if (!shouldProtectProgress || resumeState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'p') {
        event.preventDefault();
        setIsPaused((value) => !value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resumeState, shouldProtectProgress]);

  const clearStoredSession = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  const requestQuit = useCallback(
    (href: string) => {
      if (!shouldProtectProgress) {
        router.push(href);
        return;
      }

      setPendingQuitHref(href);
      setQuitDialogOpen(true);
    },
    [router, shouldProtectProgress]
  );

  const confirmQuit = useCallback(() => {
    if (!pendingQuitHref) {
      setQuitDialogOpen(false);
      return;
    }

    clearStoredSession();

    setQuitDialogOpen(false);
    setIsPaused(false);
    router.push(pendingQuitHref);
    setPendingQuitHref(null);
  }, [clearStoredSession, pendingQuitHref, router]);

  const resolveQuestion = useCallback((result: QuizQuestionResult) => {
    setResults((current) => [...current, result]);
    setIndex((current) => current + 1);
  }, []);

  const startFreshSession = useCallback(() => {
    clearStoredSession();
    setSessionCards(cards);
    setQuizMode(mode);
    setIndex(0);
    setResults([]);
    setHasSavedResult(false);
    setIsRematchSession(false);
    setIsPaused(false);
    setSessionDurationMs(0);
    setQuitDialogOpen(false);
    setPendingQuitHref(null);
    setResumeState(null);
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
    didCelebrate.current = false;
    lastTickMs.current = null;
  }, [cards, clearStoredSession, mode]);

  const resumePreviousSession = useCallback(() => {
    if (!resumeState) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(resumeState.index, resumeState.sessionCards.length - 1));
    setSessionCards(resumeState.sessionCards);
    setQuizMode(resumeState.quizMode);
    setIndex(safeIndex);
    setResults(resumeState.results.slice(0, safeIndex));
    setHasSavedResult(false);
    setIsRematchSession(Boolean(resumeState.isRematchSession));
    setIsPaused(Boolean(resumeState.isPaused));
    setSessionDurationMs(Math.max(0, resumeState.sessionDurationMs));
    setQuitDialogOpen(false);
    setPendingQuitHref(null);
    setResumeState(null);
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
    lastTickMs.current = null;
    toast.success('Resumed previous quiz session');
  }, [resumeState]);

  const restart = () => {
    startFreshSession();
  };

  const rematchMissed = () => {
    const missedIds = results.filter((entry) => !entry.correct).map((entry) => entry.cardId);
    if (missedIds.length === 0) {
      return;
    }

    const missedCards = missedIds
      .map((cardId) => sessionCards.find((card) => card.id === cardId))
      .filter((card): card is StudySessionCard => Boolean(card));

    if (missedCards.length === 0) {
      return;
    }

    setSessionCards(missedCards);
    setQuizMode(mode);
    setIndex(0);
    setResults([]);
    setHasSavedResult(false);
    setIsRematchSession(true);
    setIsPaused(false);
    setSessionDurationMs(0);
    setResumeState(null);
    clearStoredSession();
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
    didCelebrate.current = false;
    lastTickMs.current = null;
  };

  if (sessionCards.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 md:p-8 bg-bg">
        <div className="surface mx-auto max-w-2xl p-10 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Quiz
          </p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.2] text-balance">No cards available for a quiz yet</h1>
          <p className="mt-2 text-muted-foreground">
            Add cards to this deck first, then come back to test your recall.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalInDeck} card{totalInDeck !== 1 ? 's' : ''} currently in this deck
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary">
              <Link href={`/dashboard/${deckId}#add-content`}>Add cards now</Link>
            </Button>
            <Button asChild>
              <Link href={`/dashboard/${deckId}`}>Back to deck</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (resumeState) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 md:p-8 bg-bg">
        <div className="surface mx-auto max-w-2xl p-10 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Quiz
          </p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.2] text-balance">Resume your previous quiz?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick up from question {Math.min(resumeState.index + 1, resumeState.sessionCards.length)} of {resumeState.sessionCards.length}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last recorded progress: <span className="font-mono tnum">{formatDuration(resumeState.sessionDurationMs)}</span> of quiz time.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={startFreshSession}>Start new quiz</Button>
            <Button onClick={resumePreviousSession} variant="primary">Resume quiz</Button>
          </div>

          <Link href={`/dashboard/${deckId}`} className="mt-4 inline-block">
            <Button variant="ghost">Back to Deck</Button>
          </Link>
        </div>
      </div>
    );
  }

  const activeNeedsIdentificationPrompt = Boolean(active && !active.id_question);
  const activeNeedsMcq = Boolean(
    active && (!Array.isArray(active.mcq_distractors) || active.mcq_distractors.length < 3)
  );
  const incorrectResults = results.filter((entry) => !entry.correct);
  const resultActionButtonClass = 'gap-2 min-w-[11.5rem] justify-center';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      {/*
        While the quiz is paused the page behind the scrim is inert. A scrim
        that only stops the mouse is not a guard: keyboard focus walked straight
        past it into "Back to deck", the pause toggle and the feedback switches,
        which is the same class of hole as the dock painting over the overlay
        (F-01). The overlay and the quit dialog are siblings of this wrapper, so
        they stay operable.
      */}
      <div className="flex flex-1 flex-col" inert={isPaused && !completed}>
        {/*
          Part 1: Quiz telemetry header (§7.9, §4 Task 4.3). `P` was bound at all times and
          shown nowhere in the UI (defect F-05); it now sits on the control it triggers, beside
          the elapsed clock it affects.
        */}
        <header className="flex-none p-4 md:px-8 md:pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => requestQuit(`/dashboard/${deckId}`)} className="gap-2 px-2">
              <ArrowLeft className="h-4 w-4" />
              Back to deck
            </Button>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Deck
              </span>
              <span className="max-w-[10rem] truncate text-[13px] leading-none text-ink sm:max-w-[16rem]">
                {deckTitle}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Mode
              </span>
              <span className="text-[13px] leading-none text-ink">{getModeLabel(quizMode)}</span>
            </div>

            <Telemetry
              label="Question"
              value={`${Math.min(index + 1, sessionCards.length)}/${sessionCards.length}`}
            />
            <Telemetry label="Elapsed" value={formatDuration(sessionDuration)} />

            {!completed ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsPaused((value) => !value)}
                aria-pressed={isPaused}
                className="gap-2 px-2"
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {isPaused ? 'Resume' : 'Pause'}
                <Kbd>P</Kbd>
              </Button>
            ) : null}

            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => updateFeedbackPrefs({ ...feedbackPrefs, sound: !feedbackPrefs.sound })}
              aria-pressed={feedbackPrefs.sound}
              title={feedbackPrefs.sound ? 'Turn answer sounds off' : 'Turn answer sounds on'}
            >
              {feedbackPrefs.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="sr-only">{feedbackPrefs.sound ? 'Sound on' : 'Sound off'}</span>
            </Button>

            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => updateFeedbackPrefs({ ...feedbackPrefs, haptics: !feedbackPrefs.haptics })}
              aria-pressed={feedbackPrefs.haptics}
              title={feedbackPrefs.haptics ? 'Turn vibration off' : 'Turn vibration on'}
            >
              <Vibrate className={`h-3.5 w-3.5 ${feedbackPrefs.haptics ? '' : 'opacity-40'}`} />
              <span className="sr-only">{feedbackPrefs.haptics ? 'Vibration on' : 'Vibration off'}</span>
            </Button>
          </div>
        </div>

        {/* A 1px progress rule — depth is rule weight, not blur (§4.3). */}
        <div className="h-px w-full bg-border">
          <m.div
            className="h-px bg-ink-dim"
            initial={false}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
          />
        </div>

        {isPaused && !completed ? (
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-[var(--state-due)]">
            Paused
          </p>
        ) : null}
      </header>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {completed
          ? `Quiz complete. ${scoreSummary.correctCount} correct out of ${results.length}.`
          : `Question ${index + 1} of ${sessionCards.length}. ${getModeLabel(quizMode)} mode.`}
      </div>

      {completed ? (
        <main className="flex flex-1 items-start justify-center p-4 md:p-8">
          <m.div
            key="summary"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            className="mx-auto max-w-4xl space-y-6"
          >
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="surface relative overflow-hidden p-8">
                {/* Fires at a strong pass, harder at a perfect score. Suppressed
                    entirely under prefers-reduced-motion. */}
                <MasteryConfetti
                  active={completed && scoreSummary.percentage >= 80}
                  intensity={scoreSummary.percentage === 100 ? 1.6 : 1}
                />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Quiz Result</p>
                    <h2 className="mt-3 font-mono text-[28px] font-semibold leading-[1.15] tracking-[-.03em] tnum">{scoreSummary.percentage}%</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-mono tnum">{scoreSummary.correctCount}</span> of <span className="font-mono tnum">{results.length}</span> answered correctly in <span className="font-mono tnum">{formatDuration(sessionDuration)}</span>.
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-control)] border border-border-strong px-4 py-3 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Grade</p>
                    <p className="mt-1 font-mono text-3xl font-semibold tnum text-ink">{scoreSummary.letterGrade}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="surface p-4">
                    <p className="font-mono text-2xl font-semibold tnum text-[var(--state-mastered)]">{scoreSummary.correctCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Correct</p>
                  </div>
                  <div className="surface p-4">
                    <p className="font-mono text-2xl font-semibold tnum text-[var(--state-lapsed)]">{scoreSummary.incorrectCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Missed</p>
                  </div>
                  <div className="surface p-4">
                    <p className="font-mono text-2xl font-semibold tnum">{results.length > 0 ? formatDuration(averagePerQuestionMs) : '0s'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Avg. per Question</p>
                  </div>
                </div>

                {quizBadges.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {quizBadges.map((badge) => {
                      const toneClass =
                        badge.tone === 'emerald'
                          ? 'border-[var(--state-mastered)] text-[var(--state-mastered)]'
                          : badge.tone === 'amber'
                            ? 'border-[var(--state-streak)] text-[var(--state-streak)]'
                            : 'border-border-strong text-ink';

                      return (
                        <span
                          key={badge.title}
                          className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-medium ${toneClass}`}
                          title={badge.description}
                        >
                          {badge.title}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
                  <p className="text-foreground">
                    Mastery is updated from quiz performance. Daily streaks still come from flashcard review.
                  </p>
                  {isSavingResult ? (
                    <p className="mt-2">
                      {isRematchSession ? 'Saving this rematch attempt...' : 'Saving this quiz attempt...'}
                    </p>
                  ) : hasSavedResult ? (
                    <p className="mt-2">
                      {isRematchSession
                        ? 'Rematch attempts update mastery but stay out of quiz history.'
                        : 'This attempt has been recorded in your deck mastery progress.'}
                    </p>
                  ) : (
                    <p className="mt-2">This attempt is ready to be recorded once saving completes.</p>
                  )}
                </div>
              </div>

              <div className="surface p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold tracking-[-.015em]">Focus next</h3>
                  {/* A count beats a glyph (§6), and it is the fact the panel
                      is actually reporting. */}
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] tnum text-ink-dimmer">
                    {incorrectResults.length} missed
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {incorrectResults.length > 0
                    ? 'Use flashcards to reinforce the misses before re-testing.'
                    : 'You cleared every question. A review pass keeps the streak moving.'}
                </p>

                {incorrectResults.length > 0 ? (
                  <div className="mt-5 divide-y divide-border border-t border-border">
                    {incorrectResults.slice(0, 5).map((entry) => (
                      <div key={entry.cardId} className="flex gap-3 py-3">
                        <span
                          aria-hidden="true"
                          className="mt-1 h-4 w-[2px] shrink-0 rounded-[1px] bg-[var(--state-lapsed)]"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.prompt}</p>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Your answer: {entry.userAnswer || 'No answer recorded'}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--state-lapsed)]">
                            Correct answer: {entry.correctAnswer}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                    Strong pass. You can re-run the quiz in the other mode or move back into review to keep your daily streak active.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-5">
              {/*
                One filled button on the screen (§7.2). It is whichever action
                the result argues for: with misses on the board that is the
                rematch; with a clean sweep it is going back to the deck.
              */}
              {incorrectResults.length > 0 ? (
                <Button onClick={rematchMissed} variant="primary" size="lg" className={resultActionButtonClass}>
                  <RotateCcw className="h-4 w-4" />
                  {/* One flex item, not three: the button is a flex row with a
                      gap, so a bare <span> around the count would space the
                      parentheses away from it. */}
                  <span>
                    Rematch missed (<span className="tnum">{incorrectResults.length}</span>)
                  </span>
                </Button>
              ) : null}
              <Button onClick={restart} size="lg" className={resultActionButtonClass}>
                <RotateCcw className="h-4 w-4" />
                Retake quiz
              </Button>
              <Button asChild size="lg" className={resultActionButtonClass}>
                <Link href={`/dashboard/${deckId}/study`}>
                  Review flashcards
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant={incorrectResults.length > 0 ? 'default' : 'primary'}
                size="lg"
                className={resultActionButtonClass}
              >
                <Link href={`/dashboard/${deckId}`}>
                  Back to deck
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="surface p-6">
              <h3 className="text-base font-semibold tracking-[-.015em]">Question diagnostics</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Misses are listed with your answer so the next review pass has a clear target.
              </p>

              {/*
                A 2px state tick per row (§7.5) instead of a tinted card and a
                glyph — and the word beside it carries the same fact, so the
                colour is never doing the work alone (WCAG 1.4.1).
              */}
              <div className="mt-5 divide-y divide-border border-t border-border">
                {results.map((entry, resultIndex) => (
                  <div key={`${entry.cardId}-${resultIndex}`} className="flex gap-3 py-3">
                    <span
                      aria-hidden="true"
                      className="mt-1 h-4 w-[2px] shrink-0 rounded-[1px]"
                      style={{
                        backgroundColor: entry.correct
                          ? 'var(--state-mastered)'
                          : 'var(--state-lapsed)',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-foreground">{entry.prompt}</p>
                        <span
                          className="font-mono text-[10px] uppercase tracking-[0.16em]"
                          style={{
                            color: entry.correct ? 'var(--state-mastered)' : 'var(--state-lapsed)',
                          }}
                        >
                          {entry.correct ? 'Correct' : 'Missed'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Your answer: {entry.userAnswer || 'No answer recorded'}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/90">
                        Correct answer: {entry.correctAnswer}
                      </p>
                      {typeof entry.score === 'number' ? (
                        <p className="mt-0.5 font-mono text-xs tnum text-muted-foreground">
                          Similarity score: {Math.round(entry.score * 100)}%
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </m.div>
        </main>
      ) : (
        <div className="flex flex-1 flex-col">
          {quizMode === 'mcq' ? (
            <MCQMode
              key={active.id}
              card={active}
              disabled={isPaused}
              enrichmentPending={isEnriching && activeNeedsMcq}
              onResolve={(_, wasCorrect, answer) =>
                resolveQuestion({
                  cardId: active.id,
                  prompt: active.id_question ?? active.back,
                  correctAnswer: active.front,
                  userAnswer: answer,
                  correct: wasCorrect,
                })
              }
              onAnswered={handleAnswered}
              onFallbackToIdentification={() => setQuizMode('identification')}
            />
          ) : (
            <IdentificationMode
              key={active.id}
              deckId={deckId}
              card={active}
              disabled={isPaused}
              enrichmentPending={isEnriching && activeNeedsIdentificationPrompt}
              onAnswered={handleAnswered}
              onResolve={(_, score, answer) =>
                resolveQuestion({
                  cardId: active.id,
                  prompt: active.id_question ?? active.back,
                  correctAnswer: active.front,
                  userAnswer: answer,
                  correct: score >= 0.7,
                  score,
                })
              }
            />
          )}
        </div>
      )}
      </div>

      <AnimatePresence>
        {isPaused && !completed ? (
          <m.div
            key="quiz-paused-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            /*
              The scrim per §7.8: `--z-overlay` (100), which is above the rail
              at 20 — DOM order can no longer decide whether the old dock
              painted over the quit guard (F-01) — and a 4px blur, the only
              backdrop-filter permitted anywhere in the product, because it sits
              over content that is deliberately out of use.
            */
            className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
          >
            <m.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quiz-paused-title"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="surface z-[var(--z-modal)] mx-4 w-full max-w-[480px] border-border-strong p-8 text-center"
            >
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Quiz paused
              </p>
              <h3 id="quiz-paused-title" className="mt-3 text-xl font-semibold tracking-[-.025em]">
                Timer is on hold
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Resume when you are ready to continue. Your progress is preserved.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" className="gap-2" onClick={() => setIsPaused(false)} autoFocus>
                  <Play className="h-4 w-4" />
                  Resume quiz
                  <Kbd>P</Kbd>
                </Button>
                {/*
                  The only other way out of the scrim, and it goes through the
                  quit confirmation — which is what the old dock bypassed
                  entirely (F-01).
                */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => requestQuit(`/dashboard/${deckId}`)}
                >
                  Quit quiz
                </Button>
              </div>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={quitDialogOpen}
        onOpenChange={(open) => {
          setQuitDialogOpen(open);
          if (!open) {
            setPendingQuitHref(null);
          }
        }}
        title="Quit this quiz?"
        description="Are you sure you want to quit? This quiz won't be recorded."
        confirmLabel="Quit Quiz"
        cancelLabel="Continue Quiz"
        variant="destructive"
        onConfirm={confirmQuit}
      />
    </div>
  );
}