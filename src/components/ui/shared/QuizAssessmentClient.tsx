'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Brain,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { enrichCards, logQuizResult } from '@/app/actions';
import { IdentificationMode } from '@/components/ui/shared/IdentificationMode';
import { MCQMode } from '@/components/ui/shared/MCQMode';
import { Button } from '@/components/ui/button';
import type { QuizMode, StudySessionCard } from '@/lib/study';
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
  const sessionKey = useMemo(
    () => [deckId, mode, cards.map((card) => card.id).join(',')].join(':'),
    [cards, deckId, mode]
  );

  return (
    <QuizAssessmentSession
      key={sessionKey}
      deckId={deckId}
      deckTitle={deckTitle}
      cards={cards}
      totalInDeck={totalInDeck}
      mode={mode}
    />
  );
}

function QuizAssessmentSession({
  deckId,
  deckTitle,
  cards,
  totalInDeck,
  mode,
}: QuizAssessmentClientProps) {
  const [sessionStartMs, setSessionStartMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sessionCards, setSessionCards] = useState(cards);
  const [quizMode, setQuizMode] = useState<QuizMode>(mode);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<QuizQuestionResult[]>([]);
  const [hasSavedResult, setHasSavedResult] = useState(false);
  const [isEnriching, startEnrichmentTransition] = useTransition();
  const [isSavingResult, startSavingResultTransition] = useTransition();

  const requestedEnrichmentIds = useRef<Set<string>>(new Set());
  const didPersistResult = useRef(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const active = sessionCards[index];
  const completed = index >= sessionCards.length;
  const sessionDuration = nowMs - sessionStartMs;

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
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to prepare quiz data');
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
        results: results.map((entry) => ({
          card_id: entry.cardId,
          correct: entry.correct,
        })),
      });

      if (saveResult?.error) {
        didPersistResult.current = false;
        toast.error(typeof saveResult.error === 'string' ? saveResult.error : 'Failed to save quiz results');
        return;
      }

      setHasSavedResult(true);
    });
  }, [completed, deckId, quizMode, results, sessionDuration]);

  const resolveQuestion = useCallback((result: QuizQuestionResult) => {
    setResults((current) => [...current, result]);
    setIndex((current) => current + 1);
    setNowMs(Date.now());
  }, []);

  const restart = () => {
    const nextNow = Date.now();
    setSessionCards(cards);
    setQuizMode(mode);
    setIndex(0);
    setResults([]);
    setHasSavedResult(false);
    requestedEnrichmentIds.current.clear();
    didPersistResult.current = false;
    setSessionStartMs(nextNow);
    setNowMs(nextNow);
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

  const activeNeedsIdentificationPrompt = Boolean(active && !active.id_question);
  const activeNeedsMcq = Boolean(
    active && (!Array.isArray(active.mcq_distractors) || active.mcq_distractors.length < 2)
  );
  const incorrectResults = results.filter((entry) => !entry.correct);

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
          <span className="rounded-full border border-primary/15 bg-card/30 px-2.5 py-1 text-xs font-medium text-foreground">
            {getModeLabel(quizMode)} Quiz
          </span>
          <span className="flex items-center gap-1 text-xs">
            <Timer className="h-3 w-3" />
            {formatDuration(sessionDuration)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_0.9fr]">
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completed ? 'Quiz complete' : `Question ${index + 1} of ${sessionCards.length}`}
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

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Knowledge Check</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Quizzes test what you know. Flashcard review still drives streaks and review counts.
              </p>
            </div>
            <Target className="mt-1 h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

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
                    <p className="text-2xl font-bold text-primary">{results.length > 0 ? formatDuration(Math.round(sessionDuration / results.length)) : '0s'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Avg. per Question</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-primary/10 bg-card/20 p-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Mastery is updated from quiz performance. Daily streaks still come from flashcard review.
                  </div>
                  {isSavingResult ? (
                    <p className="mt-2">Saving this quiz attempt...</p>
                  ) : hasSavedResult ? (
                    <p className="mt-2">This attempt has been recorded in your deck mastery progress.</p>
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

            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={restart} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Retake Quiz
              </Button>
              <Link href={`/dashboard/${deckId}/study`}>
                <Button variant="outline" className="gap-2">
                  Review Flashcards
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
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
            key={`${quizMode}-${active.id}`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="mx-auto w-full max-w-2xl space-y-4"
          >
            {quizMode === 'mcq' ? (
              <MCQMode
                key={active.id}
                card={active}
                disabled={false}
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
                disabled={false}
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
    </div>
  );
}