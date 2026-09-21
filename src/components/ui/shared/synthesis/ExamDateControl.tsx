'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setExamDate } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.ceil((at - Date.now()) / 86_400_000);
}

/**
 * "Exam in N d" and the one control that sets it (plan D19). A date picker
 * behind a ghost button; the value is stored as the end of that day in the
 * student's own time zone, so the countdown reads the way they count.
 */
export function ExamDateControl({ deckId, examAt }: { deckId: string; examAt: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toDateInput(examAt));
  const [isPending, startTransition] = useTransition();
  const days = daysUntil(examAt);

  const save = (next: string | null) => {
    startTransition(async () => {
      const iso = next ? new Date(`${next}T23:59:00`).toISOString() : null;
      try {
        const result = await setExamDate({ deck_id: deckId, exam_at: iso });
        if (result && 'error' in result && result.error) {
          toast.error(formatActionError(result.error, 'Could not save the exam date.'));
          return;
        }
        setEditing(false);
        router.refresh();
      } catch {
        toast.error('Could not save the exam date. Check your connection and try again.');
      }
    });
  };

  if (editing) {
    return (
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value) save(value);
        }}
      >
        <label className="flex items-center gap-2">
          <span className={LABEL}>Exam on</span>
          <input
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={isPending}
            className="h-[28px] rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-transparent px-2 text-xs text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending || !value} className="h-[26px] px-2 text-[12px]">Save</Button>
        {examAt ? (
          <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => save(null)} className="h-[26px] px-2 text-[12px]">Clear</Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setEditing(false)} className="h-[26px] px-2 text-[12px]">Cancel</Button>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {days === null ? (
        <span className={LABEL}>No exam date</span>
      ) : days < 0 ? (
        <span className={LABEL}>Exam passed</span>
      ) : (
        <span className={`${LABEL} tnum`}>
          Exam in <span style={{ color: days <= 3 ? 'var(--state-due)' : 'var(--ink)' }}>{days}</span> {days === 1 ? 'day' : 'days'}
          {days <= 3 ? ' · drills return within the day' : days > 14 ? ' · ladder stretched' : ''}
        </span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-[24px] px-2 text-[12px]">
        {days === null ? 'Set exam date' : 'Change'}
      </Button>
    </div>
  );
}
