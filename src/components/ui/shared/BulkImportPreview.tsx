/* A server component: replacing the three tinted pills with `Telemetry` readings removed the last reason for this to run on the client. */

import type { ParseResult, ParseFlagReason } from '@/lib/parser';
import { Telemetry } from '@/components/ui/shared/Telemetry';

type BulkImportPreviewProps = {
  result: ParseResult;
};

const FLAG_LABELS: Record<ParseFlagReason, string> = {
  no_delimiter: 'Missing delimiter',
  empty_front: 'Empty term',
  empty_back: 'Empty description',
};

export function BulkImportPreview({ result }: BulkImportPreviewProps) {
  return (
    <div className="space-y-4">
      {/*
        Three pills became three readings (§7.9). The pill radius is for avatars
        (§4.2), and the two tinted pills used raw Tailwind hues outside the
        state channel that did not shift between themes. A count is the badge;
        only "flagged" is a state, and only when there is something in it.
      */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Telemetry label="Ready" value={result.cards.length} />
        <Telemetry
          label="Flagged"
          value={result.flagged.length}
          tone={result.flagged.length > 0 ? 'learning' : 'ink'}
        />
        <Telemetry label="Total lines" value={result.totalLines} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="surface p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-[-.015em]">Valid cards</h3>
            <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Exact text preview
            </span>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {result.cards.length > 0 ? (
              result.cards.map((card) => (
                <div
                  key={`${card.lineNumber}-${card.front}`}
                  className="border-l-2 py-2 pl-3"
                  style={{ borderColor: 'var(--state-mastered)' }}
                >
                  <div className="mb-1 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Line {card.lineNumber}
                  </div>
                  <p className="text-sm font-medium text-ink">{card.front}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.back}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[var(--radius-container)] border border-dashed border-border p-4 text-sm text-muted-foreground">
                Valid parsed cards will appear here as you type.
              </div>
            )}
          </div>
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-[-.015em]">Needs attention</h3>
            <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Not imported
            </span>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {result.flagged.length > 0 ? (
              result.flagged.map((line) => (
                <div
                  key={`${line.lineNumber}-${line.text}`}
                  className="border-l-2 py-2 pl-3"
                  style={{ borderColor: 'var(--state-learning)' }}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                      Line {line.lineNumber}
                    </span>
                    {/* The reason is a word, so the tick is never alone (§9). */}
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--state-learning)' }}
                    >
                      {FLAG_LABELS[line.reason]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{line.text}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[var(--radius-container)] border border-dashed border-border p-4 text-sm text-muted-foreground">
                No parsing issues detected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}