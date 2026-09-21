'use client';

import { useCallback, useRef } from 'react';
import { CornerBrackets } from '@/components/ui/CornerBrackets';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { normaliseForQuote } from '@/lib/synthesis/text';
import type { CanvasAnchor, PlanPoint, PlanResponse } from '@/lib/synthesis/types';

export type PlanDraft = PlanResponse;

export const EMPTY_POINT: PlanPoint = { claim: '', mechanism: '', evidence: '', limit: '' };
export const EMPTY_PLAN: PlanDraft = { thesis: '', points: [EMPTY_POINT, EMPTY_POINT, EMPTY_POINT], conclusion: '' };

type PlanFormProps = {
  plan: PlanDraft;
  onChange: (plan: PlanDraft) => void;
  anchors: CanvasAnchor[];
  disabled: boolean;
  promptId: string;
  /** Pinned above the plan while revising (audit F2). */
  revisingFrom?: string | null;
};

const SLOT_CLASS =
  'border-0 bg-transparent px-0 shadow-none focus-visible:outline-0 rounded-none text-[15px] sm:text-[15px] leading-relaxed';
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

const POINT_FIELDS: { key: keyof PlanPoint; label: string; placeholder: string; rows: number }[] = [
  { key: 'claim', label: 'Point', placeholder: 'the point this paragraph makes', rows: 1 },
  { key: 'mechanism', label: 'Because', placeholder: 'the mechanism — why the point holds', rows: 2 },
  { key: 'evidence', label: 'Evidence', placeholder: 'a named example, case, study or datum', rows: 1 },
  { key: 'limit', label: 'Limit', placeholder: 'the condition or counter-case that bounds it', rows: 1 },
];

/**
 * An essay plan (plan D15): the first eight minutes of an exam answer — a
 * thesis that answers the question, three points each with its mechanism,
 * evidence and limit, and a conclusion that judges. The screen's one
 * `.raised` object while planning; the controls inside it are naked.
 */
export function PlanForm({ plan, onChange, anchors, disabled, promptId, revisingFrom = null }: PlanFormProps) {
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const rememberFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    lastFocused.current = event.currentTarget;
  }, []);

  const setPoint = useCallback((index: number, key: keyof PlanPoint, value: string) => {
    const points = plan.points.map((point, i) => (i === index ? { ...point, [key]: value } : point)) as PlanDraft['points'];
    onChange({ ...plan, points });
  }, [onChange, plan]);

  // A term chip inserts the card's term at the caret of the last-focused field.
  const insertTerm = useCallback((term: string) => {
    const target = lastFocused.current;
    if (!target || disabled) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
    const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
    const nextValue = `${before}${needsSpaceBefore ? ' ' : ''}${term}${needsSpaceAfter ? ' ' : ''}${after}`;
    const caret = before.length + (needsSpaceBefore ? 1 : 0) + term.length;

    const name = target.name;
    if (name === 'thesis' || name === 'conclusion') {
      onChange({ ...plan, [name]: nextValue });
    } else {
      const match = name.match(/^point(\d)-(claim|mechanism|evidence|limit)$/);
      if (match) setPoint(Number(match[1]), match[2] as keyof PlanPoint, nextValue);
    }
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(caret, caret);
    });
  }, [disabled, onChange, plan, setPoint]);

  const allText = ` ${normaliseForQuote([plan.thesis, ...plan.points.flatMap((point) => [point.claim, point.mechanism, point.evidence, point.limit]), plan.conclusion].join(' '))} `;
  const isNamed = (term: string) => {
    const needle = normaliseForQuote(term);
    return needle.length > 0 && allText.includes(` ${needle} `);
  };
  const pointsStarted = plan.points.filter((point) => point.claim.trim().length > 0).length;
  const evidenceGiven = plan.points.filter((point) => point.evidence.trim().length > 0).length;

  return (
    <div className="raised spec relative flex flex-col gap-4 p-4 md:p-5">
      <CornerBrackets />

      {revisingFrom ? (
        <div className="flex gap-3 rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2" role="note">
          <span className="slot-label shrink-0 pt-[3px]">Revising · gap</span>
          <p className="text-[13px] leading-relaxed text-ink">{revisingFrom}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className={LABEL}>Insert</span>
        {anchors.map((anchor) => {
          const named = isNamed(anchor.term);
          return (
            <button
              key={anchor.id}
              type="button"
              className="term-chip"
              style={named ? { color: 'var(--ink-dimmer)', borderColor: 'var(--border)' } : undefined}
              aria-pressed={named}
              onClick={() => insertTerm(anchor.term)}
              disabled={disabled}
              title={named ? `"${anchor.term}" is in your plan` : `Insert "${anchor.term}"`}
            >
              {anchor.term}
            </button>
          );
        })}
        <span className={`${LABEL} ml-auto tnum`} aria-live="polite">
          <span style={{ color: plan.thesis.trim() ? 'var(--ink)' : undefined }}>Thesis</span>
          {' · '}
          <span style={{ color: pointsStarted === 3 ? 'var(--ink)' : undefined }}>{pointsStarted}/3 points</span>
          {' · '}
          <span style={{ color: evidenceGiven > 0 ? 'var(--ink)' : undefined }}>{evidenceGiven} evidence</span>
          {' · '}
          <span style={{ color: plan.conclusion.trim() ? 'var(--ink)' : undefined }}>Conclusion</span>
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="slot-label">Thesis · answers the question in one line</span>
        <Input
          name="thesis"
          value={plan.thesis}
          onChange={(event) => onChange({ ...plan, thesis: event.target.value })}
          onFocus={rememberFocus}
          placeholder="your position on the question as set — a judgement, not a topic"
          maxLength={300}
          disabled={disabled}
          aria-describedby={`${promptId}-prompt`}
          className={cn(SLOT_CLASS, 'h-auto py-1')}
        />
      </label>

      {plan.points.map((point, index) => (
        <fieldset key={index} className="flex flex-col gap-2 border-t border-border pt-3">
          <legend className={`${LABEL} pr-2`}>Paragraph {index + 1}</legend>
          {POINT_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="slot-label">{field.label}</span>
              {field.rows > 1 ? (
                <Textarea
                  name={`point${index}-${field.key}`}
                  value={point[field.key]}
                  onChange={(event) => setPoint(index, field.key, event.target.value)}
                  onFocus={rememberFocus}
                  placeholder={field.placeholder}
                  maxLength={300}
                  rows={field.rows}
                  disabled={disabled}
                  className={cn(SLOT_CLASS, 'min-h-[3.25rem] py-1')}
                />
              ) : (
                <Input
                  name={`point${index}-${field.key}`}
                  value={point[field.key]}
                  onChange={(event) => setPoint(index, field.key, event.target.value)}
                  onFocus={rememberFocus}
                  placeholder={field.placeholder}
                  maxLength={220}
                  disabled={disabled}
                  className={cn(SLOT_CLASS, 'h-auto py-1')}
                />
              )}
            </label>
          ))}
        </fieldset>
      ))}

      <label className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="slot-label">Conclusion · the judgement</span>
        <Input
          name="conclusion"
          value={plan.conclusion}
          onChange={(event) => onChange({ ...plan, conclusion: event.target.value })}
          onFocus={rememberFocus}
          placeholder="how far, on what condition — answer the question again, now that the points are made"
          maxLength={300}
          disabled={disabled}
          className={cn(SLOT_CLASS, 'h-auto py-1')}
        />
      </label>
    </div>
  );
}
