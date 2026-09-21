'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { GeneratePlanQuestionButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';

type PlanLauncherRowProps = {
  deckId: string;
  topics: string[];
  plans: { active: number; due: number };
};

const SELECT =
  'h-[30px] min-w-0 max-w-[11rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-transparent px-2 text-xs text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

/**
 * The plans row of the launcher (plan D15): how many plan questions the
 * deck holds and how many are due, a way to write one on a topic, and the
 * launch. The launch is a plain link — no count, no pull-forward; one
 * question, eight minutes.
 */
export function PlanLauncherRow({ deckId, topics, plans }: PlanLauncherRowProps) {
  const [topic, setTopic] = useState('');

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Essay plans</span>
        <span className="flex items-baseline gap-4">
          <Telemetry label="Plans" value={plans.active} />
          {plans.active > 0 ? <Telemetry label="Due" value={plans.due} tone={plans.due > 0 ? 'due' : 'ink'} /> : null}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-ink-dim">
        A set question over a whole topic, answered as an exam plan — thesis, three points with evidence, a judgement.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {topics.length > 0 ? (
          <select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Topic for the plan question" className={SELECT}>
            <option value="">Widest topic</option>
            {topics.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        ) : null}
        <GeneratePlanQuestionButton deckId={deckId} focusTopic={topic || null} variant="ghost" label="+ Plan question" className="h-[30px] px-2 text-[12px]" />
        {plans.active > 0 ? (
          <Button asChild size="sm" className="h-[30px] flex-1">
            <Link href={`/dashboard/${deckId}/synthesis?kind=plan&count=1`}>{plans.due > 0 ? 'Plan an answer' : 'Plan anytime'}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
