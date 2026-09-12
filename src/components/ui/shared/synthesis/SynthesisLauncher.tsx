import { Button } from '@/components/ui/button';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
import { MAX_ACTIVE_DRILLS_PER_DECK, MIN_DECK_CARDS_FOR_DRILLS } from '@/lib/synthesis/clusters';
import type { SynthesisReadings } from '@/lib/synthesis/types';
import { formatAge } from '@/lib/synthesis/ui';

type SynthesisLauncherProps = {
  deckId: string;
  readings: SynthesisReadings;
  cardCount: number;
};

const COUNT_OPTIONS = [1, 3, 5] as const;

const CHIP =
  'inline-flex h-[30px] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]';

/**
 * The synthesis block of the deck's session launcher (spec §10.2): a flat
 * `.surface` under the quiz form, with the readings strip, a count chip row
 * and the pull-forward switch. The review form stays the page's one `.raised`.
 *
 * `DUE` is informational, never a lock: the form starts a drill whenever the
 * deck has any (B.1 "drill anytime").
 */
export function SynthesisLauncher({ deckId, readings, cardCount }: SynthesisLauncherProps) {
  const tooFewCards = cardCount < MIN_DECK_CARDS_FOR_DRILLS;
  const hasDrills = readings.activeDrills > 0;
  const linksPct = readings.linksTotal > 0 ? readings.linksCovered / readings.linksTotal : 0;

  return (
    <form action={`/dashboard/${deckId}/synthesis`} method="get" className="surface flex flex-col p-4 lg:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Synthesis drills
        </h2>
        {hasDrills ? (
          <Telemetry label="Due" value={readings.due} tone={readings.due > 0 ? 'due' : 'ink'} />
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-dim">
        Argue the mechanism between concepts. Two to three minutes each; playable any time.
      </p>

      {hasDrills ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <Telemetry
              label="Links"
              value={`${readings.linksCovered}/${readings.linksTotal}`}
              tone={readings.linksTotal > 0 && linksPct >= 0.7 ? 'mastered' : 'ink'}
            />
            <Telemetry label="Last" value={formatAge(readings.lastAttemptAt)} />
            <Telemetry label="Active" value={readings.activeDrills} />
            {readings.activeDrills < MAX_ACTIVE_DRILLS_PER_DECK ? (
              <GenerateSynthesisDrillsButton
                deckId={deckId}
                count={3}
                variant="ghost"
                label="+ 3 more"
                className="ml-auto h-[24px] px-2 text-[12px]"
              />
            ) : null}
          </div>

          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" name="pull" value="1" defaultChecked className="size-[13px] accent-[var(--accent)]" />
            Pull contradicted cards forward
          </label>
          {/* An unchecked box sends nothing, which the page would read as its
              default (on). The trailing hidden field makes "off" explicit; the
              page takes the FIRST `pull` value, so a checked box still wins. */}
          <input type="hidden" name="pull" value="0" />

          <fieldset className="mt-auto flex flex-wrap items-center gap-2 pt-3.5">
            <legend className="sr-only">Drills per launch</legend>
            {COUNT_OPTIONS.map((option) => (
              <label
                key={option}
                className={`${CHIP} w-[42px] border-[var(--border-control)] font-mono text-ink tnum has-[:checked]:bg-surface-raised`}
              >
                <input
                  type="radio"
                  name="count"
                  value={option}
                  defaultChecked={option === 3}
                  className="sr-only"
                />
                {option}
              </label>
            ))}
            <Button type="submit" size="sm" className="h-[30px] flex-1">
              {readings.due > 0 ? 'Start drills' : 'Drill anytime'}
            </Button>
          </fieldset>
        </>
      ) : tooFewCards ? (
        <p className="mt-3 text-[13px] text-ink-dim">
          Synthesis drills need at least <span className="font-mono tnum">{MIN_DECK_CARDS_FOR_DRILLS}</span> cards; this deck has{' '}
          <span className="font-mono tnum">{cardCount}</span>.
        </p>
      ) : (
        <div className="mt-auto pt-3.5">
          <GenerateSynthesisDrillsButton deckId={deckId} count={3} className="h-[30px] w-full" />
        </div>
      )}
    </form>
  );
}
