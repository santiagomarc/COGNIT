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
import { DrillSessionSummary, type SessionEntry, type StoredResult } from '@/components/ui/shared/synthesis/DrillSessionSummary';
import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
import { formatActionError } from '@/lib/ai-feedback';
import { countWords, maxWordsFor, responseText } from '@/lib/synthesis/text';
import { EMPTY_PLAN, PlanForm, type PlanDraft } from '@/components/ui/shared/synthesis/PlanForm';
import type {
  AnswerMode,
  AttemptResponse,
  CanvasAnchor,
  CanvasDrill,
  Confidence,
  Diagnostic,
  DrillAttemptHistoryEntry,
  DrillReveal,
  Exemplar,
  LastAttemptSummary,
} from '@/lib/synthesis/types';
import { SLOT_LABELS } from '@/lib/synthesis/ui';
import { isConfidence } from '@/lib/synthesis/types';
import { FORMAT_LABEL, VERDICT_LABEL, VERDICT_TICK, formatAgo, formatClock, linksTone } from '@/lib/synthesis/ui';
import { RichText } from '@/components/ui/shared/RichText';

type SynthesisDrillClientProps = {
  deckId: string;
  deckTitle: string;
  drills: CanvasDrill[];
  anchorsByDrill: Record<string, CanvasAnchor[]>;
  lastAttemptByDrill: Record<string, LastAttemptSummary>;
  /** The last few attempts per drill, newest first (audit U4). */
  historyByDrill: Record<string, DrillAttemptHistoryEntry[]>;
  /** The first drill's exemplar, only while the deck has no attempts (plan D14). */
  workedExample: Exemplar | null;
  pullForward: boolean;
  activeDrillCount: number;
  /** Set when the study completion screen's capstone offer opened this drill (spec §8.3). */
  from?: 'study';
  /** Sprint (plan D13): a countdown, results withheld until the end. */
  sessionMode: 'drill' | 'sprint';
  sprintMinutes: number;
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

const EMPTY_OUTLINE: OutlineDraft = { claim: '', mechanisms: ['', ''], tradeoff: '', evidence: '' };
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
/** Past this, the checking reading says so in words (audit U3). */
const SLOW_CHECK_MS = 4_000;
const VERY_SLOW_CHECK_MS = 10_000;

type PersistedAnswer = {
  version: 3;
  mode: AnswerMode;
  outline: OutlineDraft;
  freeText: string;
  plan: PlanDraft;
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
    if (parsed.version !== 3 || !parsed.mode || !parsed.outline) return null;
    return {
      version: 3,
      mode: parsed.mode,
      outline: parsed.outline,
      freeText: parsed.freeText ?? '',
      plan: parsed.plan ?? EMPTY_PLAN,
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
  historyByDrill,
  workedExample,
  pullForward,
  activeDrillCount,
  from,
  sessionMode,
  sprintMinutes,
}: SynthesisDrillClientProps) {
  const isSprint = sessionMode === 'sprint';
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const drill = drills[index] ?? null;
  const anchors = useMemo(() => (drill ? anchorsByDrill[drill.id] ?? [] : []), [anchorsByDrill, drill]);
  const lastAttempt = drill ? lastAttemptByDrill[drill.id] ?? null : null;
  const storageKey = drill ? `synthesis-answer:${deckId}:${drill.id}` : null;

  const [phase, setPhase] = useState<Phase>('answering');
  const [mode, setMode] = useState<AnswerMode>(drills[0]?.kind === 'plan' ? 'plan' : 'outline');
  const [plan, setPlan] = useState<PlanDraft>(EMPTY_PLAN);
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
  const [sprintResults, setSprintResults] = useState<Record<string, StoredResult>>({});
  const [skipped, setSkipped] = useState(0);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const [workedExampleOpen, setWorkedExampleOpen] = useState(true);
  const [previousResponse, setPreviousResponse] = useState<AttemptResponse | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(sprintMinutes * 60_000);
  const [isChecking, startCheck] = useTransition();
  const [isArchiving, startArchive] = useTransition();
  // Set in an effect: Date.now() during render is impure (react-hooks/purity).
  const startedAtRef = useRef<number>(0);
  const sessionStartedAtRef = useRef<number>(0);
  const hydratedDrillRef = useRef<string | null>(null);
  const clientAttemptIdRef = useRef<string | null>(null);
  const promptRef = useRef<HTMLParagraphElement | null>(null);
  const confidenceRef = useRef<HTMLDivElement | null>(null);
  const deadlineRef = useRef<number>(0);
  const timeUpRef = useRef(false);
  // The countdown's callback needs the latest index and phase without re-arming the interval.
  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>('answering');
  useEffect(() => {
    indexRef.current = index;
    phaseRef.current = phase;
  }, [index, phase]);

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
      setPlan(persisted.plan);
      setConfidence(persisted.confidence);
      clientAttemptIdRef.current = persisted.clientAttemptId;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [drill, storageKey]);

  useEffect(() => {
    if (!storageKey || phase !== 'answering') return;
    const payload: PersistedAnswer = {
      version: 3,
      mode,
      outline,
      freeText,
      plan,
      confidence,
      clientAttemptId: clientAttemptIdRef.current,
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [confidence, freeText, mode, outline, phase, plan, storageKey]);

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

  // Sprint countdown (plan D13). The deadline is set once, on the first
  // tick; zero ends the launch as soon as no check is in flight — what was
  // not reached counts as skipped, like an exam paper.
  const endSprint = useCallback((answeredCurrent: boolean) => {
    setSkipped((count) => count + Math.max(0, drills.length - indexRef.current - (answeredCurrent ? 1 : 0)));
    setSessionElapsedMs(sessionStartedAtRef.current ? Date.now() - sessionStartedAtRef.current : 0);
    setPhase('finished');
  }, [drills.length]);

  useEffect(() => {
    if (!isSprint || phase === 'finished') return;
    if (deadlineRef.current === 0) deadlineRef.current = Date.now() + sprintMinutes * 60_000;
    const intervalId = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      setTimeLeftMs(Math.max(0, left));
      if (left <= 0 && !timeUpRef.current) {
        timeUpRef.current = true;
        window.clearInterval(intervalId);
        // A check in flight finishes the sprint itself when it lands.
        if (phaseRef.current !== 'checking') endSprint(false);
      }
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [endSprint, isSprint, phase, sprintMinutes]);

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
    () => (mode === 'plan'
      ? plan
      : mode === 'outline'
        ? {
          claim: outline.claim,
          mechanisms: [outline.mechanisms[0], outline.mechanisms[1]] as [string, string],
          tradeoff: outline.tradeoff,
          ...(outline.evidence?.trim() ? { evidence: outline.evidence } : {}),
        }
        : { text: freeText }),
    [freeText, mode, outline, plan],
  );
  const wordLimit = maxWordsFor(mode);
  const wordCount = useMemo(() => countWords(responseText(response)), [response]);
  const overLimit = wordCount > wordLimit;
  const hasAnswer = wordCount > 0 && (mode === 'free' || (mode === 'plan' ? plan.thesis.trim().length > 0 : outline.claim.trim().length > 0));
  // A check in flight is as unfinished as an unchecked answer (audit R7).
  const dirty = phase === 'checking' || (phase === 'answering' && wordCount > 0);

  const resetForDrill = useCallback((nextKind: 'drill' | 'plan' = 'drill') => {
    setPhase('answering');
    setMode(nextKind === 'plan' ? 'plan' : 'outline');
    setOutline(EMPTY_OUTLINE);
    setFreeText('');
    setPlan(EMPTY_PLAN);
    setConfidence(null);
    setConfidenceMissing(false);
    setResult(null);
    setExemplarHidden(false);
    setRevisionOf(null);
    setRevisionGapNote(null);
    setPreviousResponse(null);
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
    resetForDrill(drills[index + 1]?.kind ?? 'drill');
  }, [drills, finish, index, isLast, resetForDrill]);

  const showingWorkedExample = Boolean(workedExample) && index === 0 && workedExampleOpen && phase === 'answering';

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
    const snapshot = { mode, response, confidence, revisionOf, clientAttemptId: clientAttemptIdRef.current, workedExample: showingWorkedExample };

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
          prompt_variant: drill.promptVariant,
          worked_example: snapshot.workedExample,
        });
      } catch {
        // The request itself failed (a timeout, a dropped connection): the
        // answer stays, the key stays, and the retry is one tap (audit R1).
        setPhase('answering');
        setCheckError('The check did not come back. Your answer is still here — try again.');
        if (isSprint && timeUpRef.current) endSprint(false);
        return;
      }

      if (!outcome || !('success' in outcome) || !outcome.success) {
        setPhase('answering');
        setCheckError(formatActionError('error' in outcome ? outcome.error : null, 'The check failed. Please try again.'));
        if (isSprint && timeUpRef.current) endSprint(false);
        return;
      }

      const isRevision = snapshot.revisionOf !== null;
      const verdict = outcome.diagnostic.verdict;
      const checkResult: CheckResult = {
        attemptId: outcome.attemptId,
        diagnostic: outcome.diagnostic,
        reveal: outcome.reveal,
        scheduleSaved: outcome.scheduleSaved,
        mode: snapshot.mode,
        response: snapshot.response,
        isRevision,
      };
      clientAttemptIdRef.current = null;
      if (isSprint) {
        // Results wait for the end of the sprint (plan D13); the next drill comes at once.
        setSprintResults((results) => ({ ...results, [drill.id]: { drill, anchors, result: checkResult } }));
      } else {
        setResult(checkResult);
        // Two-stage feedback (audit F2): the exemplar waits while a revise is
        // still possible; a revision, a sound answer or an off-target one
        // shows it at once.
        setExemplarHidden(!isRevision && (verdict === 'partial' || verdict === 'contradicted'));
        setPhase('diagnosed');
      }
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
      if (isSprint) {
        if (timeUpRef.current) endSprint(true);
        else goNext();
      }
    });
  }, [anchors, confidence, deckId, drill, endSprint, goNext, hasAnswer, isChecking, isSprint, mode, overLimit, phase, pullForward, recordEntry, response, revisionOf, showingWorkedExample, storageKey]);

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
    setPreviousResponse(result.response);
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
          <DrillSessionSummary
            deckId={deckId}
            entries={sessionEntries}
            skipped={skipped}
            elapsedMs={sessionElapsedMs}
            results={isSprint ? sprintResults : undefined}
          />
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
            <Telemetry label={from === 'study' ? 'Capstone' : drill.kind === 'plan' ? 'Plan' : 'Drill'} value={`${index + 1}/${drills.length}`} />
            <div className="flex items-baseline gap-2">
              <span className={LABEL}>{drill.kind === 'plan' ? 'Command' : 'Format'}</span>
              <span className="text-[13px] leading-none text-ink">{drill.kind === 'plan' ? (drill.commandWord ?? 'essay') : FORMAT_LABEL[drill.format]}</span>
            </div>
            {phase === 'diagnosed' && linksReading && result ? (
              <Telemetry
                label="Links"
                value={linksReading}
                tone={linksTone(result.diagnostic.linksCovered, result.diagnostic.linksTotal, result.diagnostic.verdict)}
              />
            ) : (
              // Over the limit is an input state, not a card state: a word, not a hue (audit U5).
              <Telemetry label="Words" value={overLimit ? `${wordCount}/${wordLimit} · over` : `${wordCount}/${wordLimit}`} />
            )}
            {phase === 'checking' ? (
              <div className="flex items-center gap-2">
                <StateTick state="streak" label="Checking" />
                <span className={`${LABEL} tnum`} aria-live="polite">
                  {checkElapsedMs >= SLOW_CHECK_MS ? 'Still checking' : 'Checking'} · {checkSeconds}s
                </span>
              </div>
            ) : (
              isSprint
                ? <Telemetry label="Left" value={formatClock(timeLeftMs)} tone={timeLeftMs < 60_000 ? 'due' : 'ink'} />
                : <Telemetry label={phase === 'diagnosed' ? 'Time' : 'Elapsed'} value={formatClock(elapsedMs)} />
            )}
          </div>
        </div>
        <div className="rule" aria-hidden="true" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-8 md:px-8">
        {/* The prompt: one thing to read, on the flat ground. */}
        <section aria-labelledby={`${promptId}-prompt`}>
          {drill.scenario ? (
            // An `apply` drill is set in a case: the case reads first, in prose, then the question.
            <p className="mb-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-dim">
              <RichText text={drill.scenario} />
            </p>
          ) : null}
          <p
            id={`${promptId}-prompt`}
            ref={promptRef}
            tabIndex={-1}
            className="font-serif text-[1.5rem] leading-[1.32] tracking-[-0.02em] text-balance text-ink outline-hidden"
          >
            <RichText text={drill.promptText} />
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
            previousResponse={result.isRevision ? previousResponse : null}
            history={historyByDrill[drill.id] ?? []}
          />
        ) : (
          <>
            {showingWorkedExample && workedExample ? (
              // The deck's first drill ever: a worked example before the attempt
              // (plan D14) — the fastest way to learn what "sound" looks like,
              // shown once and never again for this deck.
              <section className="well p-4" aria-label="Worked example">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className={LABEL}>Worked example · your first drill here</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setWorkedExampleOpen(false)} className="h-[24px] px-2 text-[12px]">
                    Hide
                  </Button>
                </div>
                <p className="mt-1 text-[13px] text-ink-dim">This is what a sound answer looks like for this question. Read it, then write your own in the slots below — the next drills will not show one.</p>
                <ul className="mt-2 flex flex-col gap-2 text-sm text-ink">
                  <li><span className="text-ink-dimmer">{SLOT_LABELS[drill.format].claim} · </span><RichText text={workedExample.claim} /></li>
                  <li><span className="text-ink-dimmer">{SLOT_LABELS[drill.format].mechanism1} · </span><RichText text={workedExample.mechanisms[0]} /></li>
                  <li><span className="text-ink-dimmer">{SLOT_LABELS[drill.format].mechanism2} · </span><RichText text={workedExample.mechanisms[1]} /></li>
                  <li><span className="text-ink-dimmer">{SLOT_LABELS[drill.format].tradeoff} · </span><RichText text={workedExample.tradeoff} /></li>
                </ul>
              </section>
            ) : null}
            {drill.kind === 'plan' ? (
              <PlanForm
                plan={plan}
                onChange={setPlan}
                anchors={anchors}
                disabled={phase === 'checking'}
                promptId={promptId}
                revisingFrom={revisionOf ? revisionGapNote : null}
              />
            ) : (
              <AnswerForm
                format={drill.format}
                mode={mode === 'plan' ? 'outline' : mode}
                onModeChange={setMode}
                outline={outline}
                onOutlineChange={setOutline}
                freeText={freeText}
                onFreeTextChange={setFreeText}
                anchors={anchors}
                disabled={phase === 'checking'}
                promptId={promptId}
                revisingFrom={revisionOf ? revisionGapNote : null}
                showEvidence={drill.linkKinds.includes('evidence')}
              />
            )}
          </>
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
