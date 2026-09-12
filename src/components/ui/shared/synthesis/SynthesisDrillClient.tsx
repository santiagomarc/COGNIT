'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { archiveSynthesisDrill, checkSynthesisAttempt } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { StateTick } from '@/components/ui/shared/StateTick';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { AnswerForm, type OutlineDraft } from '@/components/ui/shared/synthesis/AnswerForm';
import { DrillResult } from '@/components/ui/shared/synthesis/DrillResult';
import { formatActionError } from '@/lib/ai-feedback';
import { MAX_ANSWER_WORDS, countWords, responseText } from '@/lib/synthesis/text';
import type {
  AnchorCard,
  AnswerMode,
  AttemptResponse,
  Diagnostic,
  Exemplar,
  LastAttemptSummary,
  SynthesisDrill,
} from '@/lib/synthesis/types';
import { FORMAT_LABEL, VERDICT_LABEL, VERDICT_TICK, formatAgo, formatClock, linksTone } from '@/lib/synthesis/ui';

type SynthesisDrillClientProps = {
  deckId: string;
  deckTitle: string;
  drills: SynthesisDrill[];
  anchorsByDrill: Record<string, AnchorCard[]>;
  lastAttemptByDrill: Record<string, LastAttemptSummary>;
  pullForward: boolean;
  activeDrillCount: number;
};

type Phase = 'answering' | 'checking' | 'diagnosed';

type CheckResult = {
  diagnostic: Diagnostic;
  exemplar: Exemplar;
  scheduleSaved: boolean;
  mode: AnswerMode;
  response: AttemptResponse;
};

const EMPTY_OUTLINE: OutlineDraft = { claim: '', mechanisms: ['', ''], tradeoff: '' };
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

type PersistedAnswer = { version: 1; mode: AnswerMode; outline: OutlineDraft; freeText: string };

function readPersistedAnswer(key: string): PersistedAnswer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAnswer;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * The drill canvas (spec §10.3–10.4). A focus route: no chrome, no ambient
 * field, one `.raised` object per phase — the answer form while answering,
 * the result panel once diagnosed.
 */
export function SynthesisDrillClient({
  deckId,
  deckTitle,
  drills,
  anchorsByDrill,
  lastAttemptByDrill,
  pullForward,
  activeDrillCount,
}: SynthesisDrillClientProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const drill = drills[index] ?? null;
  const anchors = useMemo(() => (drill ? anchorsByDrill[drill.id] ?? [] : []), [anchorsByDrill, drill]);
  const lastAttempt = drill ? lastAttemptByDrill[drill.id] ?? null : null;
  const storageKey = drill ? `synthesis-answer:${deckId}:${drill.id}` : null;

  const [phase, setPhase] = useState<Phase>('answering');
  const [mode, setMode] = useState<AnswerMode>('outline');
  const [outline, setOutline] = useState<OutlineDraft>(EMPTY_OUTLINE);
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slowCheck, setSlowCheck] = useState(false);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [isChecking, startCheck] = useTransition();
  const [isArchiving, startArchive] = useTransition();
  // Set in an effect: Date.now() during render is impure (react-hooks/purity).
  const startedAtRef = useRef<number>(0);
  const hydratedDrillRef = useRef<string | null>(null);

  // Restore a half-typed answer for this drill (tab-lifetime only, like the
  // quiz). Deferred a tick: sessionStorage is client-only, so restoring after
  // hydration keeps the server-rendered markup and the first client render
  // identical, and keeps the state update out of the effect body itself.
  useEffect(() => {
    if (!drill || !storageKey || hydratedDrillRef.current === drill.id) return;
    hydratedDrillRef.current = drill.id;
    const timer = window.setTimeout(() => {
      const persisted = readPersistedAnswer(storageKey);
      if (!persisted) return;
      setMode(persisted.mode);
      setOutline(persisted.outline);
      setFreeText(persisted.freeText);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [drill, storageKey]);

  useEffect(() => {
    if (!storageKey || phase !== 'answering') return;
    const payload: PersistedAnswer = { version: 1, mode, outline, freeText };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [freeText, mode, outline, phase, storageKey]);

  // Elapsed clock, ticking only while answering. The start mark is taken here
  // rather than in render, once per drill.
  const drillId = drill?.id ?? null;
  useEffect(() => {
    if (phase !== 'answering' || !drillId) return;
    if (startedAtRef.current === 0) startedAtRef.current = Date.now();
    const intervalId = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => window.clearInterval(intervalId);
  }, [phase, drillId]);

  const response: AttemptResponse = useMemo(
    () => (mode === 'outline'
      ? { claim: outline.claim, mechanisms: [outline.mechanisms[0], outline.mechanisms[1]] as [string, string], tradeoff: outline.tradeoff }
      : { text: freeText }),
    [freeText, mode, outline],
  );
  const wordCount = useMemo(() => countWords(responseText(response)), [response]);
  const overLimit = wordCount > MAX_ANSWER_WORDS;
  const hasAnswer = wordCount > 0 && (mode === 'free' || outline.claim.trim().length > 0);
  const dirty = phase === 'answering' && wordCount > 0;

  const resetForDrill = useCallback(() => {
    setPhase('answering');
    setMode('outline');
    setOutline(EMPTY_OUTLINE);
    setFreeText('');
    setResult(null);
    setCheckError(null);
    setSlowCheck(false);
    setElapsedMs(0);
    startedAtRef.current = 0;
  }, []);

  const check = useCallback(() => {
    if (!drill || phase !== 'answering' || !hasAnswer || overLimit || isChecking) return;
    setCheckError(null);
    setPhase('checking');
    const slowTimer = window.setTimeout(() => setSlowCheck(true), 4_000);
    const snapshot = { mode, response };

    startCheck(async () => {
      const outcome = await checkSynthesisAttempt({
        deck_id: deckId,
        drill_id: drill.id,
        mode: snapshot.mode,
        response: snapshot.response,
        duration_ms: Math.max(0, Date.now() - startedAtRef.current),
        pull_forward: pullForward,
      });
      window.clearTimeout(slowTimer);
      setSlowCheck(false);

      if (!outcome || !('success' in outcome) || !outcome.success) {
        setPhase('answering');
        setCheckError(formatActionError('error' in outcome ? outcome.error : null, 'The check failed. Please try again.'));
        return;
      }

      setResult({
        diagnostic: outcome.diagnostic,
        exemplar: outcome.exemplar,
        scheduleSaved: outcome.scheduleSaved,
        mode: snapshot.mode,
        response: snapshot.response,
      });
      setPhase('diagnosed');
      if (storageKey) {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures.
        }
      }
      if (!outcome.scheduleSaved) {
        toast.warning("Saved, but the drill's schedule did not update.");
      }
    });
  }, [deckId, drill, hasAnswer, isChecking, mode, overLimit, phase, pullForward, response, storageKey]);

  const isLast = index >= drills.length - 1;

  const goNext = useCallback(() => {
    if (isLast) {
      router.push(`/dashboard/${deckId}`);
      return;
    }
    setIndex((current) => current + 1);
    resetForDrill();
  }, [deckId, isLast, resetForDrill, router]);

  const skip = useCallback(() => {
    if (phase !== 'answering') return;
    if (storageKey) {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures.
      }
    }
    goNext();
  }, [goNext, phase, storageKey]);

  const retryInPlace = useCallback(() => {
    // Only after off_target: nothing was learned, the drill is still due.
    setPhase('answering');
    setResult(null);
    startedAtRef.current = 0;
  }, []);

  const requestQuit = useCallback(() => {
    if (dirty) {
      setQuitDialogOpen(true);
      return;
    }
    router.push(`/dashboard/${deckId}`);
  }, [deckId, dirty, router]);

  const archive = useCallback(() => {
    if (!drill) return;
    startArchive(async () => {
      const outcome = await archiveSynthesisDrill({ deck_id: deckId, drill_id: drill.id });
      if (outcome && 'error' in outcome && outcome.error) {
        toast.error(formatActionError(outcome.error, 'Failed to archive the drill.'));
        return;
      }
      toast.success('Drill archived');
      goNext();
    });
  }, [deckId, drill, goNext]);

  // Hotkeys (spec §10.8): ⌘⏎ check anywhere; S skip and N next outside inputs; Esc quit.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        check();
        return;
      }
      if (event.key === 'Escape') {
        if (quitDialogOpen) return;
        event.preventDefault();
        requestQuit();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 's' && phase === 'answering') {
        event.preventDefault();
        skip();
      } else if (key === 'n' && phase === 'diagnosed') {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [check, goNext, phase, quitDialogOpen, requestQuit, skip]);

  // Leaving with a half-typed answer through the browser also asks.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Safari still needs the legacy channel.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!drill) {
    return (
      <div className="container mx-auto flex flex-col gap-6 p-6 md:p-8">
        <header className="flex items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm" className="gap-2 px-2">
            <Link href={`/dashboard/${deckId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to deck
            </Link>
          </Button>
        </header>
        <div className="surface mx-auto w-full max-w-xl p-6 text-center">
          <p className="text-sm text-ink">
            {activeDrillCount === 0 ? 'This deck has no drills yet.' : 'No drills could be served right now.'}
          </p>
          <p className="mt-1 text-[13px] text-ink-dim">
            Generate drills from the deck page — they are playable the moment they exist.
          </p>
        </div>
      </div>
    );
  }

  const promptId = `drill-${drill.id}`;
  const linksReading = result
    ? `${result.diagnostic.linksCovered}/${result.diagnostic.linksTotal}`
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex-none space-y-3 p-4 md:px-8 md:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <Button type="button" variant="ghost" size="sm" onClick={requestQuit} className="gap-2 px-2">
            <ArrowLeft className="h-4 w-4" />
            Back to deck
            <Kbd>Esc</Kbd>
          </Button>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <span className={LABEL}>Deck</span>
              <span className="max-w-[10rem] truncate text-[13px] leading-none text-ink sm:max-w-[16rem]">{deckTitle}</span>
            </div>
            <Telemetry label="Drill" value={`${index + 1}/${drills.length}`} />
            <div className="flex items-baseline gap-2">
              <span className={LABEL}>Format</span>
              <span className="text-[13px] leading-none text-ink">{FORMAT_LABEL[drill.format]}</span>
            </div>
            {phase === 'diagnosed' && linksReading && result ? (
              <Telemetry
                label="Links"
                value={linksReading}
                tone={linksTone(result.diagnostic.linksCovered, result.diagnostic.linksTotal, result.diagnostic.verdict)}
              />
            ) : (
              <Telemetry label="Words" value={`${wordCount}/${MAX_ANSWER_WORDS}`} tone={overLimit ? 'due' : 'ink'} />
            )}
            {phase === 'checking' ? (
              <div className="flex items-center gap-2">
                <StateTick state="streak" label="Checking" />
                <span className={LABEL} aria-live="polite">{slowCheck ? 'Still checking…' : 'Checking…'}</span>
              </div>
            ) : (
              <Telemetry label={phase === 'diagnosed' ? 'Time' : 'Elapsed'} value={formatClock(elapsedMs)} />
            )}
          </div>
        </div>
        <div className="rule" aria-hidden="true" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-8 md:px-8">
        {/* The prompt: one thing to read, on the flat ground. */}
        <section aria-labelledby={`${promptId}-prompt`}>
          <p
            id={`${promptId}-prompt`}
            className="font-serif text-[1.5rem] leading-[1.32] tracking-[-0.02em] text-balance text-ink"
          >
            {drill.promptText}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={LABEL}>Concepts</span>
            <span className="text-[13px] text-ink-dim">
              {anchors.map((anchor) => anchor.term).join(' · ')}
            </span>
          </div>
          {lastAttempt && phase === 'answering' ? (
            <details className="well mt-3 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-ink-dim">
                <StateTick state={VERDICT_TICK[lastAttempt.verdict]} />
                <span>Last time · {VERDICT_LABEL[lastAttempt.verdict].toLowerCase()}</span>
                <span className="font-mono tnum">{lastAttempt.linksCovered}/{lastAttempt.linksTotal}</span>
                <span className="font-mono tnum text-ink-dimmer">{formatAgo(lastAttempt.createdAt)}</span>
              </summary>
              {lastAttempt.gapNote ? <p className="mt-2 text-[13px] text-ink-dim">{lastAttempt.gapNote}</p> : null}
            </details>
          ) : null}
        </section>

        {phase === 'diagnosed' && result ? (
          <DrillResult
            deckId={deckId}
            drill={drill}
            anchors={anchors}
            diagnostic={result.diagnostic}
            exemplar={result.exemplar}
            mode={result.mode}
            response={result.response}
            scheduleSaved={result.scheduleSaved}
          />
        ) : (
          <AnswerForm
            format={drill.format}
            mode={mode}
            onModeChange={setMode}
            outline={outline}
            onOutlineChange={setOutline}
            freeText={freeText}
            onFreeTextChange={setFreeText}
            anchors={anchors}
            disabled={phase === 'checking'}
            promptId={promptId}
          />
        )}

        {checkError ? (
          <p role="alert" className="text-[13px]" style={{ color: 'var(--state-lapsed)' }}>
            {checkError}
          </p>
        ) : null}

        {/* Actions row: on mobile the bottom band belongs to the action (§8 of the design system). */}
        <div className="sticky bottom-0 -mx-4 mt-auto flex flex-wrap items-center justify-end gap-2 bg-[var(--bg)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0">
          {phase === 'diagnosed' && result ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={archive} disabled={isArchiving}>
                {isArchiving ? 'Archiving…' : 'Archive drill'}
              </Button>
              {result.diagnostic.verdict === 'off_target' ? (
                <Button type="button" variant="default" onClick={retryInPlace}>
                  Try again
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => router.push(`/dashboard/${deckId}`)} className="gap-2">
                Done
                <Kbd>Esc</Kbd>
              </Button>
              <Button type="button" variant="primary" onClick={goNext} className="gap-2">
                {isLast ? 'Finish' : 'Next drill'}
                <Kbd>N</Kbd>
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={skip} disabled={phase === 'checking'} className="gap-2">
                Skip
                <Kbd>S</Kbd>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={check}
                disabled={phase === 'checking' || !hasAnswer || overLimit}
                className="gap-2"
              >
                {phase === 'checking' ? 'Checking…' : 'Check'}
                <Kbd>⌘⏎</Kbd>
              </Button>
            </>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={quitDialogOpen}
        onOpenChange={setQuitDialogOpen}
        title="Leave this drill?"
        description="Your answer has not been checked. It stays in this tab if you come back."
        confirmLabel="Leave"
        cancelLabel="Keep writing"
        onConfirm={() => {
          setQuitDialogOpen(false);
          router.push(`/dashboard/${deckId}`);
        }}
      />
    </div>
  );
}
