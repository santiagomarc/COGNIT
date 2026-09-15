'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { archiveSynthesisDrill, checkSynthesisAttempt, restoreSynthesisDrill } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { StateTick } from '@/components/ui/shared/StateTick';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { AnswerForm, type OutlineDraft } from '@/components/ui/shared/synthesis/AnswerForm';
import { ConfidencePicker } from '@/components/ui/shared/synthesis/ConfidencePicker';
import { DrillResult } from '@/components/ui/shared/synthesis/DrillResult';
import { DrillSessionSummary, type SessionEntry } from '@/components/ui/shared/synthesis/DrillSessionSummary';
import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
import { formatActionError } from '@/lib/ai-feedback';
import { MAX_ANSWER_WORDS, countWords, responseText } from '@/lib/synthesis/text';
import type {
  AnswerMode,
  AttemptResponse,
  CanvasAnchor,
  CanvasDrill,
  Confidence,
  Diagnostic,
  DrillReveal,
  LastAttemptSummary,
} from '@/lib/synthesis/types';
import { isConfidence } from '@/lib/synthesis/types';
import { FORMAT_LABEL, VERDICT_LABEL, VERDICT_TICK, formatAgo, formatClock, linksTone } from '@/lib/synthesis/ui';

type SynthesisDrillClientProps = {
  deckId: string;
  deckTitle: string;
  drills: CanvasDrill[];
  anchorsByDrill: Record<string, CanvasAnchor[]>;
  lastAttemptByDrill: Record<string, LastAttemptSummary>;
  pullForward: boolean;
  activeDrillCount: number;
  /** Set when the study completion screen's capstone offer opened this drill (spec §8.3). */
  from?: 'study';
};

type Phase = 'answering' | 'checking' | 'diagnosed' | 'finished';

type CheckResult = {
  attemptId: string;
  diagnostic: Diagnostic;
  reveal: DrillReveal;
  scheduleSaved: boolean;
  mode: AnswerMode;
  response: AttemptResponse;
  isRevision: boolean;
};

const EMPTY_OUTLINE: OutlineDraft = { claim: '', mechanisms: ['', ''], tradeoff: '' };
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
/** Past this, the checking reading says so in words (audit U3). */
const SLOW_CHECK_MS = 4_000;
const VERY_SLOW_CHECK_MS = 10_000;

type PersistedAnswer = {
  version: 2;
  mode: AnswerMode;
  outline: OutlineDraft;
  freeText: string;
  confidence: Confidence | null;
  /** The key of a check that did not come back; a retry reuses it (audit R8). */
  clientAttemptId: string | null;
};

function readPersistedAnswer(key: string): PersistedAnswer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAnswer> & { version?: number };
    if (parsed.version !== 2 || !parsed.mode || !parsed.outline) return null;
    return {
      version: 2,
      mode: parsed.mode,
      outline: parsed.outline,
      freeText: parsed.freeText ?? '',
      confidence: isConfidence(parsed.confidence) ? parsed.confidence : null,
      clientAttemptId: typeof parsed.clientAttemptId === 'string' ? parsed.clientAttemptId : null,
    };
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

/** A UUID for the idempotency key, or null where the platform cannot mint one (an insecure context) — the check then simply runs without one. */
function newClientAttemptId(): string | null {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
}

/**
 * The drill canvas (spec §10.3–10.4). A focus route: no chrome, no ambient
 * field, one `.raised` object per phase — the answer form while answering,
 * the result panel once diagnosed, the summary when the launch is over.
 * Nothing on this screen holds the answer key until a check returns it.
 */
export function SynthesisDrillClient({
  deckId,
  deckTitle,
  drills,
  anchorsByDrill,
  lastAttemptByDrill,
  pullForward,
  activeDrillCount,
  from,
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
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [confidenceMissing, setConfidenceMissing] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [exemplarHidden, setExemplarHidden] = useState(false);
  const [revisionOf, setRevisionOf] = useState<string | null>(null);
  const [revisionGapNote, setRevisionGapNote] = useState<string | null>(null);
  const [revisedDrillIds, setRevisedDrillIds] = useState<string[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [checkElapsedMs, setCheckElapsedMs] = useState(0);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const [isChecking, startCheck] = useTransition();
  const [isArchiving, startArchive] = useTransition();
  // Set in an effect: Date.now() during render is impure (react-hooks/purity).
  const startedAtRef = useRef<number>(0);
  const sessionStartedAtRef = useRef<number>(0);
  const hydratedDrillRef = useRef<string | null>(null);
  const clientAttemptIdRef = useRef<string | null>(null);
  const promptRef = useRef<HTMLParagraphElement | null>(null);
  const confidenceRef = useRef<HTMLDivElement | null>(null);

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
      setConfidence(persisted.confidence);
      clientAttemptIdRef.current = persisted.clientAttemptId;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [drill, storageKey]);

  useEffect(() => {
    if (!storageKey || phase !== 'answering') return;
    const payload: PersistedAnswer = {
      version: 2,
      mode,
      outline,
      freeText,
      confidence,
      clientAttemptId: clientAttemptIdRef.current,
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [confidence, freeText, mode, outline, phase, storageKey]);

  // Elapsed clock, ticking only while answering. The start mark is taken here
  // rather than in render, once per drill.
  const drillId = drill?.id ?? null;
  useEffect(() => {
    if (phase !== 'answering' || !drillId) return;
    if (sessionStartedAtRef.current === 0) sessionStartedAtRef.current = Date.now();
    if (startedAtRef.current === 0) startedAtRef.current = Date.now();
    const intervalId = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => window.clearInterval(intervalId);
  }, [phase, drillId]);

  // The checking clock: a reading that changes is the difference between
  // "working" and "hung" (audit U3).
  useEffect(() => {
    if (phase !== 'checking') return;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => setCheckElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(intervalId);
  }, [phase]);

  // Focus follows the phase (audit U2): the verdict when it arrives, the
  // prompt when a new drill does. Screen readers announce both; keyboard
  // users are placed, not left where the button was.
  useEffect(() => {
    if (phase === 'diagnosed') {
      document.getElementById('drill-verdict')?.focus({ preventScroll: false });
    }
  }, [phase]);
  useEffect(() => {
    if (index > 0) promptRef.current?.focus();
  }, [index]);

  const response: AttemptResponse = useMemo(
    () => (mode === 'outline'
      ? { claim: outline.claim, mechanisms: [outline.mechanisms[0], outline.mechanisms[1]] as [string, string], tradeoff: outline.tradeoff }
      : { text: freeText }),
    [freeText, mode, outline],
  );
  const wordCount = useMemo(() => countWords(responseText(response)), [response]);
  const overLimit = wordCount > MAX_ANSWER_WORDS;
  const hasAnswer = wordCount > 0 && (mode === 'free' || outline.claim.trim().length > 0);
  // A check in flight is as unfinished as an unchecked answer (audit R7).
  const dirty = phase === 'checking' || (phase === 'answering' && wordCount > 0);

  const resetForDrill = useCallback(() => {
    setPhase('answering');
    setMode('outline');
    setOutline(EMPTY_OUTLINE);
    setFreeText('');
    setConfidence(null);
    setConfidenceMissing(false);
    setResult(null);
    setExemplarHidden(false);
    setRevisionOf(null);
    setRevisionGapNote(null);
    setCheckError(null);
    setElapsedMs(0);
    startedAtRef.current = 0;
    clientAttemptIdRef.current = null;
  }, []);

  const recordEntry = useCallback((entry: SessionEntry) => {
    setSessionEntries((entries) => {
      const others = entries.filter((existing) => existing.drillId !== entry.drillId);
      return [...others, entry];
    });
  }, []);

  const check = useCallback(() => {
    if (!drill || phase !== 'answering' || !hasAnswer || overLimit || isChecking) return;
    if (confidence === null) {
      setConfidenceMissing(true);
      confidenceRef.current?.focus();
      return;
    }
    setCheckError(null);
    setCheckElapsedMs(0);
    setPhase('checking');
    // One key per check; a retry after a failure sends the same one, so the
    // server can hand back the attempt it already made (audit R8).
    if (!clientAttemptIdRef.current) clientAttemptIdRef.current = newClientAttemptId();
    const snapshot = { mode, response, confidence, revisionOf, clientAttemptId: clientAttemptIdRef.current };

    startCheck(async () => {
      let outcome: Awaited<ReturnType<typeof checkSynthesisAttempt>>;
      try {
        outcome = await checkSynthesisAttempt({
          deck_id: deckId,
          drill_id: drill.id,
          mode: snapshot.mode,
          response: snapshot.response,
          duration_ms: Math.max(0, Date.now() - startedAtRef.current),
          pull_forward: pullForward,
          confidence: snapshot.confidence,
          client_attempt_id: snapshot.clientAttemptId ?? undefined,
          revision_of: snapshot.revisionOf ?? undefined,
        });
      } catch {
        // The request itself failed (a timeout, a dropped connection): the
        // answer stays, the key stays, and the retry is one tap (audit R1).
        setPhase('answering');
        setCheckError('The check did not come back. Your answer is still here — try again.');
        return;
      }

      if (!outcome || !('success' in outcome) || !outcome.success) {
        setPhase('answering');
        setCheckError(formatActionError('error' in outcome ? outcome.error : null, 'The check failed. Please try again.'));
        return;
      }

      const isRevision = snapshot.revisionOf !== null;
      const verdict = outcome.diagnostic.verdict;
      setResult({
        attemptId: outcome.attemptId,
        diagnostic: outcome.diagnostic,
        reveal: outcome.reveal,
        scheduleSaved: outcome.scheduleSaved,
        mode: snapshot.mode,
        response: snapshot.response,
        isRevision,
      });
      // Two-stage feedback (audit F2): the exemplar waits while a revise is
      // still possible; a revision, a sound answer or an off-target one
      // shows it at once.
      setExemplarHidden(!isRevision && (verdict === 'partial' || verdict === 'contradicted'));
      setPhase('diagnosed');
      clientAttemptIdRef.current = null;
      const termById = new Map(anchors.map((anchor) => [anchor.id, anchor.term]));
      recordEntry({
        drillId: drill.id,
        promptText: drill.promptText,
        format: drill.format,
        verdict,
        linksCovered: outcome.diagnostic.linksCovered,
        linksTotal: outcome.diagnostic.linksTotal,
        pulledForward: outcome.diagnostic.pulledForwardCardIds.flatMap((id) => {
          const term = termById.get(id);
          return term ? [{ id, term }] : [];
        }),
        nextDueAt: outcome.diagnostic.schedule.nextDueAt,
        revised: isRevision,
      });
      if (storageKey) {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures.
        }
      }
      if (outcome.replayed) {
        toast.info('This answer had already been checked — showing that result.');
      }
      if (!outcome.scheduleSaved) {
        toast.warning("Saved, but the drill's schedule did not update.");
      }
    });
  }, [anchors, confidence, deckId, drill, hasAnswer, isChecking, mode, overLimit, phase, pullForward, recordEntry, response, revisionOf, storageKey]);

  const isLast = index >= drills.length - 1;

  const finish = useCallback(() => {
    setSessionElapsedMs(sessionStartedAtRef.current ? Date.now() - sessionStartedAtRef.current : 0);
    setPhase('finished');
  }, []);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setIndex((current) => current + 1);
    resetForDrill();
  }, [finish, isLast, resetForDrill]);

  const skip = useCallback(() => {
    if (phase !== 'answering') return;
    if (storageKey) {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures.
      }
    }
    setSkipped((count) => count + 1);
    goNext();
  }, [goNext, phase, storageKey]);

  const retryInPlace = useCallback(() => {
    // Only after off_target: nothing was learned, the drill is still due.
    setPhase('answering');
    setResult(null);
    startedAtRef.current = 0;
  }, []);

  const canRevise = Boolean(
    drill
    && result
    && phase === 'diagnosed'
    && !result.isRevision
    && (result.diagnostic.verdict === 'partial' || result.diagnostic.verdict === 'contradicted')
    && !revisedDrillIds.includes(drill.id),
  );

  // Revise (audit F2): the answer comes back with the gap note pinned above
  // it; the exemplar stays closed. One per drill per launch.
  const revise = useCallback(() => {
    if (!drill || !result || !canRevise) return;
    setRevisedDrillIds((ids) => [...ids, drill.id]);
    setRevisionOf(result.attemptId);
    setRevisionGapNote(result.diagnostic.gapNote);
    setResult(null);
    setPhase('answering');
    setCheckError(null);
    startedAtRef.current = 0;
  }, [canRevise, drill, result]);

  const requestQuit = useCallback(() => {
    if (phase === 'checking') {
      toast.info('Your answer is being checked — one moment.');
      return;
    }
    if (dirty) {
      setQuitDialogOpen(true);
      return;
    }
    router.push(`/dashboard/${deckId}`);
  }, [deckId, dirty, phase, router]);

  const archive = useCallback(() => {
    if (!drill) return;
    const archived = drill;
    startArchive(async () => {
      try {
        const outcome = await archiveSynthesisDrill({ deck_id: deckId, drill_id: archived.id });
        if (outcome && 'error' in outcome && outcome.error) {
          toast.error(formatActionError(outcome.error, 'Failed to archive the drill.'));
          return;
        }
      } catch {
        toast.error('Could not archive the drill. Check your connection and try again.');
        return;
      }
      toast.success('Drill archived', {
        action: {
          label: 'Undo',
          onClick: () => {
            restoreSynthesisDrill({ deck_id: deckId, drill_id: archived.id })
              .then((restored) => {
                if (restored && 'error' in restored && restored.error) {
                  toast.error(formatActionError(restored.error, 'Could not restore the drill.'));
                  return;
                }
                toast.success('Drill restored');
              })
              .catch(() => toast.error('Could not restore the drill.'));
          },
        },
      });
      goNext();
    });
  }, [deckId, drill, goNext]);

  // Hotkeys (spec §10.8): ⌘⏎ check anywhere; S skip, N next, R revise and
  // 1 / 2 / 3 confidence outside inputs; Esc quit.
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
      } else if (key === 'r' && canRevise) {
        event.preventDefault();
        revise();
      } else if ((key === '1' || key === '2' || key === '3') && phase === 'answering') {
        event.preventDefault();
        setConfidence(Number(key) as Confidence);
        setConfidenceMissing(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRevise, check, goNext, phase, quitDialogOpen, requestQuit, revise, skip]);

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

  if (phase === 'finished') {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex-none space-y-3 p-4 md:px-8 md:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <Button asChild variant="ghost" size="sm" className="gap-2 px-2">
              <Link href={`/dashboard/${deckId}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to deck
              </Link>
            </Button>
            <div className="flex items-baseline gap-2">
              <span className={LABEL}>Deck</span>
              <span className="max-w-[10rem] truncate text-[13px] leading-none text-ink sm:max-w-[16rem]">{deckTitle}</span>
            </div>
          </div>
          <div className="rule" aria-hidden="true" />
        </header>
        <main className="flex flex-1 items-start justify-center p-4 md:p-8">
          <DrillSessionSummary deckId={deckId} entries={sessionEntries} skipped={skipped} elapsedMs={sessionElapsedMs} />
        </main>
      </div>
    );
  }

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
        <div className="surface mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-6 text-center">
          <div>
            <p className="text-sm text-ink">
              {activeDrillCount === 0 ? 'This deck has no drills yet.' : 'No drills could be served right now.'}
            </p>
            <p className="mt-1 text-[13px] text-ink-dim">
              {activeDrillCount === 0
                ? 'Generate a few — they are playable the moment they exist.'
                : 'Their cards may have been deleted. Generating new drills tidies them away.'}
            </p>
          </div>
          <GenerateSynthesisDrillsButton deckId={deckId} count={3} size="default" />
        </div>
      </div>
    );
  }

  const promptId = `drill-${drill.id}`;
  const linksReading = result
    ? `${result.diagnostic.linksCovered}/${result.diagnostic.linksTotal}`
    : null;
  const checkSeconds = Math.floor(checkElapsedMs / 1000);

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
            <Telemetry label={from === 'study' ? 'Capstone' : 'Drill'} value={`${index + 1}/${drills.length}`} />
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
              // Over the limit is an input state, not a card state: a word, not a hue (audit U5).
              <Telemetry label="Words" value={overLimit ? `${wordCount}/${MAX_ANSWER_WORDS} · over` : `${wordCount}/${MAX_ANSWER_WORDS}`} />
            )}
            {phase === 'checking' ? (
              <div className="flex items-center gap-2">
                <StateTick state="streak" label="Checking" />
                <span className={`${LABEL} tnum`} aria-live="polite">
                  {checkElapsedMs >= SLOW_CHECK_MS ? 'Still checking' : 'Checking'} · {checkSeconds}s
                </span>
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
            ref={promptRef}
            tabIndex={-1}
            className="font-serif text-[1.5rem] leading-[1.32] tracking-[-0.02em] text-balance text-ink outline-hidden"
          >
            {drill.promptText}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={LABEL}>Concepts</span>
            <span className="text-[13px] text-ink-dim">
              {anchors.map((anchor) => anchor.term).join(' · ')}
            </span>
          </div>
          {lastAttempt && phase === 'answering' && !revisionOf ? (
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
            attemptId={result.attemptId}
            diagnostic={result.diagnostic}
            reveal={result.reveal}
            mode={result.mode}
            response={result.response}
            scheduleSaved={result.scheduleSaved}
            exemplarHidden={exemplarHidden}
            onShowExemplar={() => setExemplarHidden(false)}
            isRevision={result.isRevision}
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
            revisingFrom={revisionOf ? revisionGapNote : null}
          />
        )}

        {phase === 'checking' && checkElapsedMs >= VERY_SLOW_CHECK_MS ? (
          <p className="text-[13px] text-ink-dim" aria-live="polite">
            Taking longer than usual — your answer is saved in this tab.
          </p>
        ) : null}

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
              {canRevise ? (
                <Button type="button" variant="default" onClick={revise} className="gap-2">
                  Revise
                  <Kbd>R</Kbd>
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
              <ConfidencePicker
                ref={confidenceRef}
                value={confidence}
                onChange={(value) => {
                  setConfidence(value);
                  setConfidenceMissing(false);
                }}
                disabled={phase === 'checking'}
                missing={confidenceMissing}
              />
              <span className="flex-1" aria-hidden="true" />
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
