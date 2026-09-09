/* A server component, for the same reason as HowItWorks — the only client code left is inside `RevealOnScroll`. */

import { RevealOnScroll } from '@/components/motion';

/*
 * Each feature leads with a fact rather than a glyph (§6). The old grid gave
 * every card a tinted icon box — one of them `<Wand2/>` — and the icons were
 * interchangeable, which is the tell that they were decoration.
 *
 * Two descriptions were also no longer true. "Dark Mode" promised "a premium
 * Deep Navy dark theme with glassmorphism and neon accents"; the product is
 * true-neutral zinc with no glass and no neon, in two themes that get equal QA.
 * "3D Flashcards" sold the flip as the feature. The flip is still there, and so
 * is swipe-to-grade — but what the card is actually for is reading a long
 * answer without truncation, which is what the copy now says.
 */
const features = [
  {
    stat: 'PDF',
    title: 'Import anything',
    description:
      'Upload a document and Cognit extracts the study material. PDFs, markdown and plain text.',
  },
  {
    stat: 'AI',
    title: 'Cards written for you',
    description:
      'Dense source material becomes question-and-answer pairs you can edit, tag and quiz on.',
  },
  {
    stat: 'SM-2',
    title: 'Scheduled, not guessed',
    description:
      'Every grade moves the card along a real interval. The deck tells you what is due and when.',
  },
  {
    stat: '4',
    title: 'Grades, on the home row',
    description:
      'Again, hard, good, easy — bound to 1 through 4, with the interval each one buys shown before you commit.',
  },
  {
    stat: '2',
    title: 'Themes, both first-class',
    description:
      'A true-neutral light and dark theme. Colour appears only where it reports scheduler state.',
  },
  {
    stat: '⌘K',
    title: 'Keyboard first',
    description:
      'Jump to any deck, start a session or flip a theme without reaching for the mouse.',
  },
];

export function FeatureGrid() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-lg text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Features
          </p>
          <h2 className="mt-3 font-serif text-[clamp(2rem,3vw,2.5rem)] font-normal leading-[1.15] tracking-[-0.015em] text-balance text-ink">
            Everything you need to ace every exam
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for serious students who want real results.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <RevealOnScroll key={feature.title} delay={i * 0.05} className="surface p-6">
              <p className="font-mono text-2xl font-semibold leading-none tracking-[-.03em] tnum text-ink">
                {feature.stat}
              </p>
              <h3 className="mt-4 text-base font-semibold tracking-[-.015em] text-ink">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
