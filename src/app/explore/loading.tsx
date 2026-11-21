import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/ui/shared/Wordmark';

/**
 * The Explore skeleton (UIUX plan PERF-08): the page's own frame, so the
 * wordmark and the title don't move when the directory arrives, then the
 * search field and a few deck rows. The directory read is a database round
 * trip, and the page was blank until it finished.
 */
export default function ExploreLoading() {
  return (
    <main id="main-content" className="container mx-auto flex max-w-3xl flex-col gap-4 p-4 md:py-10" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <Wordmark href="/" size="sm" />
        <div className="flex items-center gap-4">
          <div className="glass-skeleton h-4 w-14 rounded-sm" />
          <ThemeToggle />
        </div>
      </div>
      <div className="h-px w-full bg-border" />
      <header>
        <p className="type-label text-ink-dimmer">Directory</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Explore decks</h1>
      </header>
      <div className="glass-skeleton h-[44px] w-full rounded-[var(--radius-md)]" />
      <div className="well overflow-hidden px-3.5" role="status" aria-label="Loading decks">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="glass-skeleton block h-3.5 w-2/5 rounded-sm" />
              <span className="glass-skeleton block h-3 w-3/5 rounded-sm" />
            </span>
            <span className="glass-skeleton block h-3 w-10 rounded-sm" />
            <span className="glass-skeleton block h-3 w-16 rounded-sm" />
          </div>
        ))}
      </div>
    </main>
  );
}
