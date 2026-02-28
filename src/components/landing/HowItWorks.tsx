'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Upload, Wand2, GraduationCap } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload or type your material',
    description:
      'Drop a PDF, paste your notes, or type questions manually. Cognit handles any format so you can start studying in seconds.',
  },
  {
    number: '02',
    icon: Wand2,
    title: 'AI generates smart flashcards',
    description:
      'Our AI reads your content, identifies key concepts, and creates perfectly-phrased question-answer pairs — no manual work required.',
  },
  {
    number: '03',
    icon: GraduationCap,
    title: 'Master it with spaced repetition',
    description:
      'The SM-2 algorithm schedules reviews at the optimal moment. Each session gets you closer to long-term retention.',
  },
];

export function HowItWorks() {
  const reduced = useReducedMotion();

  return (
    <section id="how-it-works" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-16 max-w-lg text-center"
        >
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to mastery
          </h2>
          <p className="mt-3 text-muted-foreground">
            From raw material to lasting knowledge in minutes, not hours.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative mx-auto max-w-2xl">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/30 via-primary/15 to-transparent sm:left-8" />

          <div className="space-y-16">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.number}
                  initial={reduced ? undefined : { opacity: 0, x: -24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  className="relative flex gap-6 sm:gap-8"
                >
                  {/* Step indicator */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-lg shadow-primary/5 sm:h-16 sm:w-16">
                    <Icon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                    {/* Glow ring */}
                    <span className="absolute inset-0 -z-10 rounded-2xl bg-primary/15 blur-md" />
                  </div>

                  {/* Content */}
                  <div className="pt-1 sm:pt-3">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-primary/60">
                      Step {step.number}
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight sm:text-xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
