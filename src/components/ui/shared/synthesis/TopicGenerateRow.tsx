'use client';

import { useState } from 'react';
import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
import type { SynthesisFormat } from '@/lib/synthesis/types';

type TopicGenerateRowProps = {
  deckId: string;
  /** The deck's most common topic tags; an empty list hides the select. */
  topics: string[];
  count?: number;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'ghost';
  buttonClassName?: string;
  className?: string;
};

/**
 * Which formats a batch draws on (plan D11). The mixes are named for what
 * they train, not for the format names, which mean nothing to a student.
 */
export const FORMAT_MIXES: { id: string; label: string; formats: SynthesisFormat[] }[] = [
  { id: 'core', label: 'Mechanisms', formats: ['causal', 'counterfactual', 'comparative'] },
  { id: 'exam', label: 'Exam questions', formats: ['evaluate', 'apply', 'distinguish'] },
  { id: 'deep', label: 'Go deeper', formats: ['elaborate', 'causal', 'evaluate'] },
  { id: 'all', label: 'Everything', formats: ['causal', 'counterfactual', 'comparative', 'evaluate', 'apply', 'distinguish', 'elaborate'] },
];

const SELECT =
  'h-[30px] min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-transparent px-2 text-xs text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

/**
 * Topic-directed generation (audit F3): the action always accepted
 * `focus_topic`; this is the control that sends it. Any topic by default;
 * the mechanism mix by default.
 */
export function TopicGenerateRow({
  deckId,
  topics,
  count = 3,
  label,
  size = 'sm',
  variant = 'default',
  buttonClassName,
  className,
}: TopicGenerateRowProps) {
  const [topic, setTopic] = useState('');
  const [mix, setMix] = useState(FORMAT_MIXES[0].id);
  const formats = FORMAT_MIXES.find((entry) => entry.id === mix)?.formats ?? FORMAT_MIXES[0].formats;

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-2'}>
      {topics.length > 0 ? (
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          aria-label="Topic for new drills"
          className={`${SELECT} max-w-[11rem] flex-1`}
        >
          <option value="">Any topic</option>
          {topics.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      ) : null}
      <select value={mix} onChange={(event) => setMix(event.target.value)} aria-label="Kind of drills to generate" className={`${SELECT} max-w-[9rem]`}>
        {FORMAT_MIXES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <GenerateSynthesisDrillsButton
        deckId={deckId}
        count={count}
        focusTopic={topic || null}
        formats={formats}
        label={label}
        size={size}
        variant={variant}
        className={buttonClassName}
      />
    </div>
  );
}
