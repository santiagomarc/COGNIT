/* A server component again: with the sparkle logo replaced by the wordmark there is no hook, no handler and no motion left in this file. */

import { Wordmark } from '@/components/ui/shared/Wordmark';

const footerLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Wordmark href="/" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-dim">
              Flashcards from your PDFs and notes, scheduled with spaced repetition.
            </p>
          </div>

          {/* Link column */}
          <nav aria-label="Footer" className="lg:col-start-5">
            <ul className="space-y-2.5">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="rounded-[var(--radius-control)] text-sm text-ink-dim outline-hidden transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-ink-dimmer">
            &copy; {new Date().getFullYear()} Cognit. All rights reserved.
          </p>
          <p className="text-xs text-ink-dimmer">
            Built with Next.js, Supabase &amp; Gemini
          </p>
        </div>
      </div>
    </footer>
  );
}
