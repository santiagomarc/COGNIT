/* A server component: the scroll reveal lives in `RevealOnScroll`, so this file no longer calls a hook of its own. */

import { RevealOnScroll } from '@/components/motion';

const steps = [
  {
    number: '01',
    title: 'Upload or type your material',
    description:
      'Drop a PDF, paste your notes, or type questions manually. Cognit handles any format so you can start studying in seconds.',
  },
  {
    number: '02',
    title: 'AI generates the cards',
    description:
      'Cognit reads your content, identifies the key concepts, and writes question-and-answer pairs you can edit before you study them.',
  },
  {
    number: '03',
    title: 'Master it with spaced repetition',
    description:
      'The SM-2 algorithm schedules each card for the moment you are about to forget it. Every session pushes the next review further out.',
  },
];

/**
 * The three-step explainer (design system §6).
 *
 * The step glyphs are gone — one of them was `<Wand2/>`, and the other two were
 * decorating a list that already numbers itself. §6 is explicit that a number
 * is a better badge than an icon, and these steps come pre-numbered, so the
 * icon boxes (each with a `blur-md` "glow ring" behind it) were carrying no
 * information at all. The gradient rule down the left is now a 1px `--border`.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-16 max-w-lg text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            How it works
          </p>
          <h2 className="mt-3 font-serif text-[clamp(3rem,4.5vw,3.75rem)] leading-[1.08] tracking-[-0.02em] text-balance text-ink">
            Three steps to mastery
          </h2>
          <p className="mt-3 text-muted-foreground">
            From raw material to lasting knowledge in minutes, not hours.
          </p>
        </div>

        <ol className="relative mx-auto max-w-2xl border-l border-border pl-8 sm:pl-10">
          {steps.map((step, i) => (
            <RevealOnScroll
              key={step.number}
              as="li"
              delay={i * 0.08}
              className="relative pb-12 last:pb-0"
            >
              {/* The marker sits on the rule, at the metric's own weight. */}
              <span
                aria-hidden="true"
                className="absolute -left-[calc(2rem+1px)] top-1 flex h-6 w-[2px] items-center bg-ink sm:-left-[calc(2.5rem+1px)]"
              />
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Step {step.number}
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-[-.02em] text-ink sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{step.description}</p>
            </RevealOnScroll>
          ))}
        </ol>
      </div>
    </section>
  );
}
