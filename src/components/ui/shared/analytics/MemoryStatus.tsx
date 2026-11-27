import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { retrievabilityHistogram } from '@/lib/analytics';

type Bar = ReturnType<
  typeof retrievabilityHistogram
>[number];

type MemoryStatusProps = {
  bars: Bar[];
  recommendedHref: string | null;
};

export function MemoryStatus({
  bars,
  recommendedHref,
}: MemoryStatusProps) {
  const total = bars.reduce(
    (sum, bar) => sum + bar.cards,
    0
  );

  const atRisk = bars
    .filter((bar) => bar.atRisk)
    .reduce((sum, bar) => sum + bar.cards, 0);

  const holding = total - atRisk;

  const riskShare =
    total > 0 ? (atRisk / total) * 100 : 0;

  const holdingShare =
    total > 0 ? (holding / total) * 100 : 0;

  const riskPercentage = Math.round(riskShare);

  const holdingPercentage =
    total > 0 ? 100 - riskPercentage : 0;

  return (
    <section
      className="surface spec min-w-0 px-4 py-3"
      aria-labelledby="memory-heading"
    >
      <h2
        id="memory-heading"
        className="type-h3 font-semibold leading-tight text-ink"
      >
        Memory Status
      </h2>

      <p className="mt-1 text-xs leading-snug text-ink-dim">
        An estimate of how well you remember
        your reviewed flashcards.
      </p>

      {total === 0 ? (
        <p className="py-6 text-center text-xs text-ink-dim">
          Review flashcards to see their memory status.
        </p>
      ) : (
        <div className="mt-3 grid items-center gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,135px),1fr))]">

          {/* Left: proportional bar and legend */}
          <div className="min-w-0">
            <div
              className="flex h-[11px] w-full overflow-hidden rounded-full bg-[var(--border)]"
              role="img"
              aria-label={`${atRisk} cards at risk, ${holding} cards holding well`}
            >
              {atRisk > 0 && (
                <span
                  style={{
                    width: `${riskShare}%`,
                    backgroundColor: 'var(--state-due)',
                  }}
                />
              )}

              {holding > 0 && (
                <span
                  style={{
                    width: `${holdingShare}%`,
                    backgroundColor: 'var(--ink-dim)',
                  }}
                />
              )}
            </div>

            {/* Compact horizontal legend */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div
                className="flex flex-wrap items-center gap-1"
                title="Estimated recall below 80%"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{
                    backgroundColor: 'var(--state-due)',
                  }}
                  aria-hidden="true"
                />

                <span className="text-[11px] font-medium text-ink">
                  Cards at risk
                </span>

                <span className="text-[11px] tnum text-ink-dim">
                  {atRisk} ({riskPercentage}%)
                </span>
              </div>

              <div
                className="flex flex-wrap items-center gap-1"
                title="Estimated recall of 80% or above"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full bg-[var(--ink-dim)]"
                  aria-hidden="true"
                />

                <span className="text-[11px] font-medium text-ink">
                  Holding well
                </span>

                <span className="text-[11px] tnum text-ink-dim">
                  {holding} ({holdingPercentage}%)
                </span>
              </div>
            </div>
          </div>

          {/* Right: reviewed-card count and action */}
          <div className="flex min-w-0 flex-col items-start border-l border-border pl-3">
            <p className="font-mono text-[24px] font-semibold leading-none tnum text-ink">
              {total}
            </p>

            <p className="mt-1 text-[11px] text-ink-dim">
              Reviewed flashcards with estimates
            </p>

            {atRisk > 0 && recommendedHref && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="mt-2 h-auto min-h-8 w-full justify-between gap-1 rounded-[10px] border border-[#B7410E]/15 bg-[#B7410E]/10 px-2 py-1.5 text-[11px] font-semibold text-[var(--state-due)] hover:border-[#B7410E] hover:bg-[#B7410E] hover:text-white"
              >
                <Link href={recommendedHref}>
                  <span className="whitespace-normal leading-tight">
                    Review recommended deck
                  </span>

                  <ArrowRight
                    className="size-3 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}