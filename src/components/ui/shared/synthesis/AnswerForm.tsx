'use client';

import { useCallback, useRef } from 'react';
import { CornerBrackets } from '@/components/ui/CornerBrackets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AnswerMode, CanvasAnchor, OutlineResponse, SynthesisFormat } from '@/lib/synthesis/types';
import { normaliseForQuote } from '@/lib/synthesis/text';
import { EVIDENCE_SLOT, FREE_TEXT_PLACEHOLDER, SLOT_LABELS, SLOT_PLACEHOLDERS } from '@/lib/synthesis/ui';

export type OutlineDraft = OutlineResponse;

type AnswerFormProps = {
  format: SynthesisFormat;
  mode: AnswerMode;
  onModeChange: (mode: AnswerMode) => void;
  outline: OutlineDraft;
  onOutlineChange: (outline: OutlineDraft) => void;
  freeText: string;
  onFreeTextChange: (text: string) => void;
  anchors: CanvasAnchor[];
  disabled: boolean;
  promptId: string;
  /** Pinned above the slots while revising (audit F2): the gap note the revision answers. */
  revisingFrom?: string | null;
  /** The key asks for a named example: show the fifth slot (plan D12). */
  showEvidence?: boolean;
};

const SLOT_CLASS =
  'border-0 bg-transparent px-0 shadow-none focus-visible:outline-0 rounded-none text-[15px] sm:text-[15px] leading-relaxed';

/**
 * The four slots (spec §10.3): Claim · Mechanism 1 · Mechanism 2 · Trade-off,
 * labelled per format (Appendix B), or one free-text slot. The container is
 * the screen's one `.raised` object while answering; the controls inside it
 * are naked — the plane is the frame, and focus is the corner brackets.
 */
export function AnswerForm({
  format,
  mode,
  onModeChange,
  outline,
  onOutlineChange,
  freeText,
  onFreeTextChange,
  anchors,
  disabled,
  promptId,
  revisingFrom = null,
  showEvidence = false,
}: AnswerFormProps) {
  const labels = SLOT_LABELS[format];
  const placeholders = SLOT_PLACEHOLDERS[format];
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // What the answer already names (audit U2): a chip dims once its term is in
  // the text, and the meter says which slots hold anything. Both are computed
  // from slot emptiness and term presence only — no content is judged here.
  const answerNormalised = ` ${normaliseForQuote(mode === 'outline'
    ? [outline.claim, outline.mechanisms[0], outline.mechanisms[1], outline.tradeoff, outline.evidence ?? ''].join(' ')
    : freeText)} `;
  const isNamed = (term: string) => {
    const needle = normaliseForQuote(term);
    return needle.length > 0 && answerNormalised.includes(` ${needle} `);
  };
  const filled = {
    claim: outline.claim.trim().length > 0,
    mechanisms: [outline.mechanisms[0], outline.mechanisms[1]].filter((slot) => slot.trim().length > 0).length,
    tradeoff: outline.tradeoff.trim().length > 0,
    evidence: (outline.evidence ?? '').trim().length > 0,
  };

  const rememberFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    lastFocused.current = event.currentTarget;
  }, []);

  // A term chip inserts the card's term at the caret of the last-focused
  // slot — the fast-entry affordance that makes the outline thumb-typeable.
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

    if (target instanceof HTMLTextAreaElement && target.name === 'free') {
      onFreeTextChange(nextValue);
    } else {
      const field = target.name as keyof OutlineDraft | 'mechanism1' | 'mechanism2';
      if (field === 'claim' || field === 'tradeoff' || field === 'evidence') {
        onOutlineChange({ ...outline, [field]: nextValue });
      } else if (field === 'mechanism1') {
        onOutlineChange({ ...outline, mechanisms: [nextValue, outline.mechanisms[1]] });
      } else if (field === 'mechanism2') {
        onOutlineChange({ ...outline, mechanisms: [outline.mechanisms[0], nextValue] });
      }
    }

    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(caret, caret);
    });
  }, [disabled, onFreeTextChange, onOutlineChange, outline]);

  const locked = disabled;

  return (
    <div className="raised spec relative flex flex-col gap-4 p-4 md:p-5">
      <CornerBrackets />

      {revisingFrom ? (
        <div className="flex gap-3 rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2" role="note">
          <span className="slot-label shrink-0 pt-[3px]">Revising · gap</span>
          <p className="text-[13px] leading-relaxed text-ink">{revisingFrom}</p>
        </div>
      ) : null}

      {/* Concept chips: the prompt names these anyway, so they are not a hint —
          they are typing accelerators. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Insert
        </span>
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
              disabled={locked}
              title={named ? `"${anchor.term}" is in your answer` : `Insert "${anchor.term}"`}
            >
              {anchor.term}
            </button>
          );
        })}
        {mode === 'outline' ? (
          <span className="ml-auto font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer" aria-live="polite">
            <span style={{ color: filled.claim ? 'var(--ink)' : undefined }}>{labels.claim}</span>
            {' · '}
            <span style={{ color: filled.mechanisms === 2 ? 'var(--ink)' : undefined }}>{filled.mechanisms}/2</span>
            {' · '}
            <span style={{ color: filled.tradeoff ? 'var(--ink)' : undefined }}>{labels.tradeoff}</span>
            {showEvidence ? (
              <>
                {' · '}
                <span style={{ color: filled.evidence ? 'var(--ink)' : undefined }}>{EVIDENCE_SLOT.label}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      {mode === 'outline' ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="slot-label">{labels.claim}</span>
            <Input
              name="claim"
              value={outline.claim}
              onChange={(event) => onOutlineChange({ ...outline, claim: event.target.value })}
              onFocus={rememberFocus}
              placeholder={placeholders.claim}
              maxLength={200}
              disabled={locked}
              aria-describedby={`${promptId}-prompt`}
              className={cn(SLOT_CLASS, 'h-auto py-1')}
            />
          </label>
          <div className="rule rule--soft" aria-hidden="true" />
          <label className="flex flex-col gap-1">
            <span className="slot-label">{labels.mechanism1}</span>
            <Textarea
              name="mechanism1"
              value={outline.mechanisms[0]}
              onChange={(event) => onOutlineChange({ ...outline, mechanisms: [event.target.value, outline.mechanisms[1]] })}
              onFocus={rememberFocus}
              placeholder={placeholders.mechanism1}
              maxLength={220}
              rows={2}
              disabled={locked}
              className={cn(SLOT_CLASS, 'min-h-[3.25rem] py-1')}
            />
          </label>
          <div className="rule rule--soft" aria-hidden="true" />
          <label className="flex flex-col gap-1">
            <span className="slot-label">{labels.mechanism2}</span>
            <Textarea
              name="mechanism2"
              value={outline.mechanisms[1]}
              onChange={(event) => onOutlineChange({ ...outline, mechanisms: [outline.mechanisms[0], event.target.value] })}
              onFocus={rememberFocus}
              placeholder={placeholders.mechanism2}
              maxLength={220}
              rows={2}
              disabled={locked}
              className={cn(SLOT_CLASS, 'min-h-[3.25rem] py-1')}
            />
          </label>
          <div className="rule rule--soft" aria-hidden="true" />
          <label className="flex flex-col gap-1">
            <span className="slot-label">{labels.tradeoff}</span>
            <Textarea
              name="tradeoff"
              value={outline.tradeoff}
              onChange={(event) => onOutlineChange({ ...outline, tradeoff: event.target.value })}
              onFocus={rememberFocus}
              placeholder={placeholders.tradeoff}
              maxLength={220}
              rows={2}
              disabled={locked}
              className={cn(SLOT_CLASS, 'min-h-[3.25rem] py-1')}
            />
          </label>
          {showEvidence ? (
            <>
              <div className="rule rule--soft" aria-hidden="true" />
              <label className="flex flex-col gap-1">
                <span className="slot-label">{EVIDENCE_SLOT.label}</span>
                <Textarea
                  name="evidence"
                  value={outline.evidence ?? ''}
                  onChange={(event) => onOutlineChange({ ...outline, evidence: event.target.value })}
                  onFocus={rememberFocus}
                  placeholder={EVIDENCE_SLOT.placeholder}
                  maxLength={220}
                  rows={2}
                  disabled={locked}
                  className={cn(SLOT_CLASS, 'min-h-[3.25rem] py-1')}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="slot-label">Answer</span>
          <Textarea
            name="free"
            value={freeText}
            onChange={(event) => onFreeTextChange(event.target.value)}
            onFocus={rememberFocus}
            placeholder={FREE_TEXT_PLACEHOLDER}
            maxLength={1500}
            disabled={locked}
            aria-describedby={`${promptId}-prompt`}
            className={cn(SLOT_CLASS, 'drill-editor min-h-[22vh]')}
          />
        </label>
      )}

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={mode === 'outline'}
          onClick={() => onModeChange('outline')}
          disabled={disabled}
        >
          Outline
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={mode === 'free'}
          onClick={() => onModeChange('free')}
          disabled={disabled}
        >
          Free text
        </Button>
      </div>
    </div>
  );
}
