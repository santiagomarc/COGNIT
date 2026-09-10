import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/Kbd';
import { DeckReviewHotkey } from '@/components/ui/shared/DeckReviewHotkey';
import type { getSessionCardBounds } from '@/lib/study';

type SessionBounds = ReturnType<typeof getSessionCardBounds>;

type DeckSessionLauncherProps = {
  deckId: string;
  dueCount: number;
  totalCards: number;
  quizReadyCards: number;
  unprovenCards: number;
  estimatedMinutes: number;
  sessionBounds: SessionBounds;
};

const SCOPE_OPTIONS = [
  { value: 'due', label: 'Due only', defaultChecked: true },
  { value: 'include_reviewed', label: 'Include reviewed', defaultChecked: false },
  { value: 'unmastered_only', label: 'Unmastered only', defaultChecked: false },
];

const MODE_OPTIONS = [
  { value: 'mcq', label: 'Multiple choice', defaultChecked: true },
  { value: 'identification', label: 'Identification', defaultChecked: false },
];

const CHIP =
  'inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]';

/**
 * The deck page's primary action zone — the one `.raised` object on the screen
 * (Run 6, Task 3.3).
 *
 * The page this replaces gave review and quiz two `.surface` blocks of equal
 * weight in a `lg:grid-cols-2`, sitting among five more blocks of the same
 * weight. Reviewing is what the whole product is built around, so it takes the
 * raised plane, the hero figure and the page's one filled button; the quiz is
 * a real but secondary destination and sits beside it on the flat surface.
 *
 * The deck's due count becomes the largest number on the screen. It used to be
 * one reading in a telemetry strip where every value was the same 13px — so the
 * one *actionable* number was buried among five *descriptive* ones.
 *
 * Both `<form method="get">` submissions are preserved exactly: this is a
 * layout change, not a behaviour change.
 */
export function DeckSessionLauncher({
  deckId,
  dueCount,
  totalCards,
  quizReadyCards,
  unprovenCards,
  estimatedMinutes,
  sessionBounds,
}: DeckSessionLauncherProps) {
  const hasDue = dueCount > 0;

  return (
    <section className="flex flex-col items-stretch gap-4 lg:flex-row">
      {/* ── Review ── */}
      <form
        action={`/dashboard/${deckId}/study`}
        method="get"
        id="deck-review-form"
        className="raised spec flex min-w-0 flex-1 flex-col p-4 md:px-[22px] md:py-[18px]"
      >
        <DeckReviewHotkey formId="deck-review-form" enabled={hasDue || totalCards > 0} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <p
              className="shrink-0 font-mono text-[38px] font-semibold leading-[0.86] tracking-[-0.045em] tnum md:text-[44px]"
              style={{ color: hasDue ? 'var(--state-due)' : 'var(--ink)' }}
            >
              {dueCount}
            </p>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">
                {hasDue ? 'Review flashcards' : 'Nothing due — study ahead'}
              </h2>
              <p className="mt-0.5 text-xs text-ink-dim">
                Spaced repetition · advances your streak and heatmap
                {hasDue ? (
                  <>
                    {' '}
                    · est. <span className="font-mono tnum">{estimatedMinutes}</span> min
                  </>
                ) : null}
              </p>
            </div>
          </div>

          {/* The deck page's one filled button (§7.2). */}
          <Button type="submit" variant="primary" size="lg" className="shrink-0 gap-2 max-sm:w-full">
            {hasDue ? 'Review flashcards' : 'Study ahead'}
            <Kbd>R</Kbd>
          </Button>
        </div>

        <div className="rule rule--soft my-3.5" />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="inline-flex items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Session
            </span>
            <Input
              name="count"
              type="number"
              min={sessionBounds.min || undefined}
              max={sessionBounds.max || undefined}
              step={1}
              defaultValue={sessionBounds.defaultCount || undefined}
              className="h-[30px] w-[74px] px-2 text-[13px] sm:text-[13px]"
              aria-label="Number of flashcards to review"
            />
          </label>

          <fieldset className="inline-flex flex-wrap items-center gap-2">
            <legend className="float-left mr-2.5 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Scope
            </legend>
            {SCOPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`${CHIP} border-[var(--border-control)] text-ink has-[:checked]:bg-surface-raised`}
              >
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  defaultChecked={option.defaultChecked}
                  className="size-[13px] accent-[var(--accent)]"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
      </form>

      {/* ── Quiz ── */}
      <form
        action={`/dashboard/${deckId}/quiz`}
        method="get"
        className="surface flex flex-col p-4 lg:w-[322px] lg:shrink-0 lg:p-5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Take quiz
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
            <span className="text-ink">{quizReadyCards}</span>/{totalCards} ready
          </p>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-ink-dim">
          Assessment mode. Results update this deck&apos;s mastery score.
        </p>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            name="focus_unproven"
            value="1"
            className="size-[13px] accent-[var(--accent)]"
          />
          Include all unproven (<span className="font-mono tnum">{unprovenCards}</span>)
        </label>

        <fieldset className="mt-auto flex flex-wrap items-center gap-2 pt-3.5">
          <legend className="sr-only">Quiz mode</legend>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`${CHIP} flex-1 justify-center border-[var(--border-control)] text-ink has-[:checked]:bg-surface-raised`}
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                defaultChecked={option.defaultChecked}
                className="size-[13px] accent-[var(--accent)]"
              />
              {option.value === 'mcq' ? 'MCQ' : 'Identify'}
            </label>
          ))}
          <Button type="submit" size="sm" className="h-[30px] flex-1">
            Start quiz
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
