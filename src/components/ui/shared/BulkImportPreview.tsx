'use client';

import type { ParseResult, ParseFlagReason } from '@/lib/parser';

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
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
          {result.cards.length} ready
        </span>
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-300">
          {result.flagged.length} flagged
        </span>
        <span className="rounded-full border border-primary/15 bg-card/50 px-2.5 py-1">
          {result.totalLines} total lines
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-primary/10 bg-card/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Valid Cards</h3>
            <span className="text-xs text-muted-foreground">Exact text preview</span>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {result.cards.length > 0 ? (
              result.cards.map((card) => (
                <div key={`${card.lineNumber}-${card.front}`} className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Line {card.lineNumber}
                  </div>
                  <p className="text-sm font-medium">{card.front}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.back}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-primary/15 p-4 text-sm text-muted-foreground">
                Valid parsed cards will appear here as you type.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/10 bg-card/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Needs Attention</h3>
            <span className="text-xs text-muted-foreground">These lines will not be imported</span>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {result.flagged.length > 0 ? (
              result.flagged.map((line) => (
                <div key={`${line.lineNumber}-${line.text}`} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Line {line.lineNumber}
                    </span>
                    <span className="text-[11px] font-medium text-amber-300">
                      {FLAG_LABELS[line.reason]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{line.text}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-primary/15 p-4 text-sm text-muted-foreground">
                No parsing issues detected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}