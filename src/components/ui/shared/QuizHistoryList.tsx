'use client';

import Link from 'next/link';

import type { QuizHistoryEntry } from '@/index';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

const quizHistoryDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

/**
 * A quiz score is a reading, not an SM-2 state, so it is `--ink` up and down
 * the list — except at the two ends, where it genuinely reports one: a pass
 * that clears the mastery bar, and a run that will drop ease.
 *
 * The green/yellow/red pill this replaces gave three thresholds a colour and a
 * fill, which made a page of ordinary results look like an alarm panel.
 */
function scoreColor(percentage: number) {
  if (percentage >= 80) return 'var(--state-mastered)';
  if (percentage < 50) return 'var(--state-lapsed)';
  return 'var(--ink)';
}

export function QuizHistoryList({ history, deckId }: { history: QuizHistoryEntry[]; deckId: string }) {
  if (!history || history.length === 0) {
    return (
      <section className="surface p-5 text-center md:p-6">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Quiz history
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          No quiz history yet. Take your first quiz to start your mastery timeline.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/dashboard/${deckId}/quiz?mode=mcq`}>Take your first quiz</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Quiz history
        </h2>
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
          {history.length} attempts
        </p>
      </div>

      <Accordion type="single" collapsible className="mt-4 w-full border-t border-border">
        {history.map((result) => {
          const percentage = result.score_percentage;
          const date = quizHistoryDateFormatter.format(new Date(result.created_at));

          return (
            <AccordionItem value={result.id} key={result.id} className="border-b border-border">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex w-full items-center gap-4 pr-3 text-left">
                  <span
                    className="w-12 shrink-0 font-mono text-[15px] font-semibold tnum"
                    style={{ color: scoreColor(percentage) }}
                  >
                    {percentage}%
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {result.mode === 'mcq' ? 'Multiple choice' : 'Identification'}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[13px] tnum text-ink-dim sm:block">
                    {result.correct_cards}/{result.total_cards}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[13px] tnum text-ink-dimmer md:block">
                    {date}
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent className="border-t border-border pb-5 pt-4">
                {result.incorrect_answers && result.incorrect_answers.length > 0 ? (
                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
                      Needs review · {result.wrong_count} missed
                    </p>
                    {result.incorrect_answers.map((mistake, i) => (
                      <div key={i} className="flex gap-3">
                        {/* A 2px state tick instead of a tinted card (§7.5). */}
                        <span
                          aria-hidden="true"
                          className="mt-1 h-4 w-[2px] shrink-0 rounded-[1px] bg-[var(--state-lapsed)]"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
                              {mistake.card_number ? `#${mistake.card_number}` : '#?'}
                            </span>
                            <p className="text-sm font-medium text-foreground">{mistake.prompt}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            You answered:{' '}
                            <span className="text-[var(--state-lapsed)]">
                              {mistake.user_answer ?? 'Not recorded for this attempt'}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Correct term: <span className="text-ink">{mistake.correct_answer}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--state-mastered)]">
                    Flawless run — every question correct.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
