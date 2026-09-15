'use client';

import { useState } from 'react';
import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';

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
 * Topic-directed generation (audit F3): the action always accepted
 * `focus_topic`; this is the control that sends it. Any topic by default.
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

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-2'}>
      {topics.length > 0 ? (
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          aria-label="Topic for new drills"
          className="h-[30px] min-w-0 max-w-[12rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-transparent px-2 text-xs text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <option value="">Any topic</option>
          {topics.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      ) : null}
      <GenerateSynthesisDrillsButton
        deckId={deckId}
        count={count}
        focusTopic={topic || null}
        label={label}
        size={size}
        variant={variant}
        className={buttonClassName}
      />
    </div>
  );
}
