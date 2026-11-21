import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/ui/shared/Wordmark';

/**
 * The shared-deck skeleton (UIUX plan PERF-08): the header frame, then three
 * card placeholders. Someone arriving from a link in Discord waits on the
 * deck and its preview cards, and used to see nothing until both were back.
 */
export default function SharedDeckLoading() {
  return (
    <main id="main-content" className="container mx-auto max-w-5xl space-y-8 p-6 md:p-10" aria-busy="true">
      <header className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Wordmark href="/" size="sm" />
          <ThemeToggle />
        </div>

        <div className="h-px w-full bg-border" />

        <div className="space-y-3">
          <p className="type-label text-ink-dimmer">Shared deck</p>
          <div className="glass-skeleton h-10 w-3/5 max-w-md rounded-sm" />
          <div className="glass-skeleton h-3.5 w-full max-w-xl rounded-sm" />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="glass-skeleton h-8 w-16 rounded-sm" />
          <div className="glass-skeleton h-8 w-20 rounded-sm" />
        </div>

        <div className="glass-skeleton h-10 w-44 rounded-[var(--radius-sm)]" />
      </header>

      <section className="space-y-4" role="status" aria-label="Loading deck">
        <div className="glass-skeleton h-6 w-48 rounded-sm" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="glass-skeleton h-48 w-full rounded-[var(--radius-container)]" />
          ))}
        </div>
      </section>
    </main>
  );
}
