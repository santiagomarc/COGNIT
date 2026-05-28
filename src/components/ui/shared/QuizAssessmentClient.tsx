'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Brain,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enrichCards, logQuizResult } from '@/app/actions';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { IdentificationMode } from '@/components/ui/shared/IdentificationMode';
import { MCQMode } from '@/components/ui/shared/MCQMode';
import { Button } from '@/components/ui/button';
import type { QuizMode, StudySessionCard } from '@/lib/study';
import { formatActionError } from '@/lib/ai-feedback';
import { motionSprings } from '@/lib/motion-configs';
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
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [pendingQuitHref, setPendingQuitHref] = useState<string | null>(null);
  const [isEnriching, startEnrichmentTransition] = useTransition();
  const [isSavingResult, startSavingResultTransition] = useTransition();

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

        return !Array.isArray(card.mcq_distractors) || card.mcq_distractors.length < 2 || !card.id_question;
      })
      .slice(0, 50)
      .map((card) => card.id);

    if (missingIds.length === 0) {
      return;
    }

    missingIds.forEach((id) => requestedEnrichmentIds.current.add(id));

    startEnrichmentTransition(async () => {
      const result = await enrichCards({ deck_id: deckId, card_ids: missingIds });
      if (result?.error) {
        toast.error(formatActionError(result.error, 'Failed to prepare quiz data'));
        return;
      }

      applyEnrichment(result?.cards ?? []);
    });
  }, [applyEnrichment, deckId, quizMode, sessionCards]);

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
    setShowShortcutHelp(false);
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
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
    setShowShortcutHelp(false);
    clearStoredSession();
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
    lastTickMs.current = null;
  };

  if (sessionCards.length === 0) {
    return (
      <div className="container mx-auto p-6 md:p-8">
        <div className="glass-card mx-auto max-w-2xl rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">No cards available for a quiz yet</h1>
          <p className="mt-2 text-muted-foreground">
            Add cards to this deck first, then come back to test your recall.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalInDeck} card{totalInDeck !== 1 ? 's' : ''} currently in this deck
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
          <h1 className="text-2xl font-semibold">Resume your previous quiz?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick up from question {Math.min(resumeState.index + 1, resumeState.sessionCards.length)} of {resumeState.sessionCards.length}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last recorded progress: {formatDuration(resumeState.sessionDurationMs)} of quiz time.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={startFreshSession} variant="outline">Start New Quiz</Button>
            <Button onClick={resumePreviousSession}>Resume Quiz</Button>
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
    active && (!Array.isArray(active.mcq_distractors) || active.mcq_distractors.length < 2)
  );
  const incorrectResults = results.filter((entry) => !entry.correct);
  const resultActionButtonClass = 'gap-2 min-w-[11.5rem] justify-center';

  return (
    <div className="container mx-auto space-y-6 p-6 pb-28 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => requestQuit(`/dashboard/${deckId}`)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Deck
        </button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{deckTitle}</span>
          <span className="rounded-full border border-primary/15 bg-card/30 px-2.5 py-1 text-xs font-medium text-foreground">
            {getModeLabel(quizMode)} Quiz
          </span>
          <span className="flex items-center gap-1 text-xs">
            <Timer className="h-3 w-3" />
            {formatDuration(sessionDuration)}
          </span>
          {!completed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => setIsPaused((value) => !value)}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            onClick={() => setShowShortcutHelp((value) => !value)}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Shortcuts
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Progress</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {completed ? 'Quiz complete' : `Question ${index + 1} of ${sessionCards.length}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-primary/15 bg-card/30 px-2.5 py-1 font-medium text-foreground">
              {getModeLabel(quizMode)}
            </span>
            <span className="rounded-full border border-primary/15 bg-card/30 px-2.5 py-1 font-medium text-foreground">
              {Math.min(progress, 100)}% complete
            </span>
            <span className="flex items-center gap-1 rounded-full border border-primary/15 bg-card/30 px-2.5 py-1 font-medium text-foreground">
              <Timer className="h-3 w-3" />
              {formatDuration(sessionDuration)}
            </span>
            {isPaused && !completed ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-200">
                Paused
              </span>
            ) : null}
          </div>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={reduced ? { duration: 0 } : motionSprings.quizProgress}
          />
        </div>
      </div>

      {showShortcutHelp ? (
        <div className="glass-card rounded-2xl border border-primary/15 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Keyboard Shortcuts</p>
          <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
            {quizMode === 'mcq' ? (
              <>
                <p>
                  <span className="rounded border border-primary/20 bg-card/40 px-1.5 py-0.5 font-mono text-[11px]">1-4</span>{' '}
                  Select an MCQ option
                </p>
                <p>
                  <span className="rounded border border-primary/20 bg-card/40 px-1.5 py-0.5 font-mono text-[11px]">Space</span>{' '}
                  Continue after feedback
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="rounded border border-primary/20 bg-card/40 px-1.5 py-0.5 font-mono text-[11px]">Enter</span>{' '}
                  Check typed answer
                </p>
                <p>
                  Use keyboard focus + Enter to trigger Continue
                </p>
              </>
            )}
            <p>
              <span className="rounded border border-primary/20 bg-card/40 px-1.5 py-0.5 font-mono text-[11px]">P</span>{' '}
              Pause or resume the quiz
            </p>
          </div>
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {completed
          ? `Quiz complete. ${scoreSummary.correctCount} correct out of ${results.length}.`
          : `Question ${index + 1} of ${sessionCards.length}. ${getModeLabel(quizMode)} mode.`}
      </div>

      <AnimatePresence mode="wait">
        {completed ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduced ? { duration: 0 } : motionSprings.quizPanel}
            className="mx-auto max-w-4xl space-y-6"
          >
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="glass-card glow-border rounded-3xl p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Quiz Result</p>
                    <h2 className="mt-3 text-3xl font-bold tracking-tight">{scoreSummary.percentage}%</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {scoreSummary.correctCount} of {results.length} answered correctly in {formatDuration(sessionDuration)}.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-center">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Grade</p>
                    <p className="mt-1 text-3xl font-bold text-primary">{scoreSummary.letterGrade}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-2xl font-bold text-emerald-300">{scoreSummary.correctCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Correct</p>
                  </div>
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                    <p className="text-2xl font-bold text-red-300">{scoreSummary.incorrectCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Missed</p>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                    <p className="text-2xl font-bold text-primary">{results.length > 0 ? formatDuration(averagePerQuestionMs) : '0s'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Avg. per Question</p>
                  </div>
                </div>

                {quizBadges.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {quizBadges.map((badge) => {
                      const toneClass =
                        badge.tone === 'emerald'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                          : badge.tone === 'amber'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                            : 'border-primary/20 bg-primary/10 text-primary';

                      return (
                        <span
                          key={badge.title}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClass}`}
                          title={badge.description}
                        >
                          {badge.title}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-6 rounded-2xl border border-primary/10 bg-card/20 p-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Mastery is updated from quiz performance. Daily streaks still come from flashcard review.
                  </div>
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

              <div className="glass-card rounded-3xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">Focus Next</h3>
                    <p className="text-sm text-muted-foreground">
                      {incorrectResults.length > 0
                        ? 'Use flashcards to reinforce the misses before re-testing.'
                        : 'You cleared every question. A review pass keeps the streak moving.'}
                    </p>
                  </div>
                  {incorrectResults.length > 0 ? (
                    <CircleAlert className="h-5 w-5 text-amber-300" />
                  ) : (
                    <CircleCheckBig className="h-5 w-5 text-emerald-300" />
                  )}
                </div>

                {incorrectResults.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {incorrectResults.slice(0, 5).map((entry) => (
                      <div key={entry.cardId} className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                        <p className="text-sm font-medium text-foreground">{entry.prompt}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Your answer: {entry.userAnswer || 'No answer recorded'}</p>
                        <p className="mt-1 text-xs text-red-200">Correct answer: {entry.correctAnswer}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                    Strong pass. You can re-run the quiz in the other mode or move back into review to keep your daily streak active.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-5">
              {incorrectResults.length > 0 ? (
                <Button onClick={rematchMissed} size="lg" className={resultActionButtonClass}>
                  <RotateCcw className="h-4 w-4" />
                  Rematch Missed ({incorrectResults.length})
                </Button>
              ) : null}
              <Button onClick={restart} variant="outline" size="lg" className={resultActionButtonClass}>
                <RotateCcw className="h-4 w-4" />
                Retake Quiz
              </Button>
              <Button asChild variant="outline" size="lg" className={resultActionButtonClass}>
                <Link href={`/dashboard/${deckId}/study`}>
                  Review Flashcards
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" className={resultActionButtonClass}>
                <Link href={`/dashboard/${deckId}`}>
                  Back to Deck
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="glass-card rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">Question Diagnostics</h3>
                  <p className="text-sm text-muted-foreground">Misses are listed with your answer so the next review pass has a clear target.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {results.map((entry, resultIndex) => (
                  <div
                    key={`${entry.cardId}-${resultIndex}`}
                    className={`rounded-2xl border p-4 ${entry.correct ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.prompt}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Your answer: {entry.userAnswer || 'No answer recorded'}</p>
                        <p className="mt-1 text-xs text-foreground/90">Correct answer: {entry.correctAnswer}</p>
                        {typeof entry.score === 'number' ? (
                          <p className="mt-1 text-xs text-muted-foreground">Similarity score: {Math.round(entry.score * 100)}%</p>
                        ) : null}
                      </div>
                      {entry.correct ? (
                        <CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-300" />
                      ) : (
                        <CircleAlert className="h-5 w-5 shrink-0 text-red-300" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            
          </motion.div>
        ) : (
          <motion.div
            key={`${quizMode}-${active.id}`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={reduced ? { duration: 0 } : motionSprings.quizPanel}
            className="mx-auto w-full max-w-2xl space-y-4"
          >
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
                onFallbackToIdentification={() => setQuizMode('identification')}
              />
            ) : (
              <IdentificationMode
                key={active.id}
                deckId={deckId}
                card={active}
                disabled={isPaused}
                enrichmentPending={isEnriching && activeNeedsIdentificationPrompt}
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
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPaused && !completed ? (
          <motion.div
            key="quiz-paused-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : motionSprings.overlay}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={reduced ? { duration: 0 } : motionSprings.modal}
              className="glass-card mx-4 w-full max-w-md rounded-3xl p-8 text-center"
            >
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Quiz Paused</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">Timer is on hold</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Resume when you are ready to continue. Your progress is preserved.
              </p>
              <Button
                type="button"
                className="mt-6 gap-2"
                onClick={() => setIsPaused(false)}
              >
                <Play className="h-4 w-4" />
                Resume Quiz
              </Button>
            </motion.div>
          </motion.div>
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