'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StateTick } from '@/components/ui/shared/StateTick';
import type { DrillVerdict, SynthesisFormat } from '@/lib/synthesis/types';
import { FORMAT_LABEL, VERDICT_LABEL, VERDICT_TICK, formatClock, formatDueIn } from '@/lib/synthesis/ui';

export type SessionEntry = {
  drillId: string;
  promptText: string;
  format: SynthesisFormat;
  verdict: DrillVerdict;
  linksCovered: number;
  linksTotal: number;
  pulledForward: { id: string; term: string }[];
  nextDueAt: string;
  revised: boolean;
};

type DrillSessionSummaryProps = {
  deckId: string;
  entries: SessionEntry[];
  skipped: number;
  elapsedMs: number;
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The end of a launch (audit U1): what happened, drill by drill, which cards
 * were pulled forward, and when the next drill is due. *Review pulled cards
 * now* is the concrete "successive relearning" step the spec promises —
 * the contradicted cards, as a study session, while the error is fresh.
 */
export function DrillSessionSummary({ deckId, entries, skipped, elapsedMs }: DrillSessionSummaryProps) {
  const counts = entries.reduce<Record<DrillVerdict, number>>(
    (acc, entry) => ({ ...acc, [entry.verdict]: acc[entry.verdict] + 1 }),
    { sound: 0, partial: 0, contradicted: 0, off_target: 0 },
  );
  const linksCovered = entries.reduce((sum, entry) => sum + entry.linksCovered, 0);
  const linksTotal = entries.reduce((sum, entry) => sum + entry.linksTotal, 0);
  const pulled = [...new Map(entries.flatMap((entry) => entry.pulledForward).map((card) => [card.id, card])).values()];
  const nextDue = entries.map((entry) => entry.nextDueAt).sort()[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="surface p-6 text-center md:p-8">
        <p className={LABEL}>Session</p>
        <h2 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance">Drills complete</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-mono tnum">{entries.length}</span> {entries.length === 1 ? 'drill' : 'drills'} ·{' '}
          <span className="font-mono tnum">{linksCovered}/{linksTotal}</span> links
          {skipped > 0 ? <> · <span className="font-mono tnum">{skipped}</span> skipped</> : null}
          {' · '}<span className="font-mono tnum">{formatClock(elapsedMs)}</span>
        </p>
      </section>

      <div className="grid grid-cols-4 gap-3">
        {([['sound', 'Sound'], ['partial', 'Partial'], ['contradicted', 'Contradicted'], ['off_target', 'Off target']] as const).map(([verdict, word]) => (
          <div key={verdict} className="surface p-4 text-center">
            <p className="font-mono text-2xl font-semibold tnum text-ink">{counts[verdict]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{word}</p>
          </div>
        ))}
      </div>

      {entries.length > 0 ? (
        <ul className="surface divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.drillId} className="flex items-center gap-3 px-5 py-3">
              <StateTick state={VERDICT_TICK[entry.verdict]} />
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dim">
                {VERDICT_LABEL[entry.verdict]}{entry.revised ? ' · rev' : ''}
              </span>
              <span className="w-10 shrink-0 font-mono text-[13px] tnum text-ink">{entry.linksCovered}/{entry.linksTotal}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.promptText}</span>
              <span className="hidden shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer md:block">
                {FORMAT_LABEL[entry.format]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <span className={LABEL}>Cards</span>
        {pulled.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <StateTick state="due" />
            {pulled.map((card) => <span key={card.id} className="term-chip cursor-default">{card.term}</span>)}
            <span className="text-ink-dim">→ due tomorrow</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-dim">unchanged</span>
        )}
        {nextDue ? (
          <span className={`${LABEL} ml-auto tnum`}>Next drill {formatDueIn(nextDue)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {pulled.length > 0 ? (
          <Button asChild>
            <Link href={`/dashboard/${deckId}/study?cards=${pulled.map((card) => card.id).join(',')}`}>
              Review pulled cards now
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="primary" className="gap-2">
          <Link href={`/dashboard/${deckId}`}>
            Back to deck
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
