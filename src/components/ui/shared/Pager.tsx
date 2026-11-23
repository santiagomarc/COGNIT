import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { pageItems } from '@/lib/card-pages';

type PagerProps = {
  /** Names the navigation, e.g. "Deck pages". */
  label: string;
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
};

/**
 * Previous, page numbers, next. Below `lg` it is "Page 2 of 9" instead of the
 * numbers: seven 44px targets and two arrows do not fit a phone, or a tablet
 * with the sidebar open.
 */
export function Pager({ label, page, pages, onPageChange }: PagerProps) {
  if (pages <= 1) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2 border-t border-border pt-4 lg:justify-center">
      <Button type="button" size="sm" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Previous
      </Button>

      <p className="type-sm text-ink-dim lg:hidden">
        Page <span className="font-mono tnum text-ink">{page}</span> of <span className="font-mono tnum">{pages}</span>
      </p>

      <ol className="hidden items-center gap-1 lg:flex">
        {pageItems(page, pages).map((item, index) => (
          <li key={item === 'gap' ? `gap-${index}` : item}>
            {item === 'gap' ? (
              <span className="flex w-8 justify-center text-ink-dimmer" aria-hidden="true">…</span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPageChange(item)}
                className="min-w-8 px-1.5 font-mono tnum text-ink-dim pointer-coarse:min-w-11 aria-[current=page]:border-[var(--border-control)] aria-[current=page]:bg-surface-raised aria-[current=page]:text-ink"
              >
                {item}
              </Button>
            )}
          </li>
        ))}
      </ol>

      <Button type="button" size="sm" onClick={() => onPageChange(page + 1)} disabled={page === pages}>
        Next
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </nav>
  );
}
