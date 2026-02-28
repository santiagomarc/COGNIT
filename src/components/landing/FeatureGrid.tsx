'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Wand2,
  Box,
  Clock,
  Moon,
  Smartphone,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'PDF Import',
    description:
      'Upload any document and auto-extract study material. Supports PDFs, markdown, and plain text.',
  },
  {
    icon: Wand2,
    title: 'AI Generation',
    description:
      'GPT-powered card creation turns dense content into perfectly-phrased question-answer pairs.',
  },
  {
    icon: Box,
    title: '3D Flashcards',
    description:
      'Buttery-smooth 3D flip animations with drag gestures make studying feel satisfying.',
  },
  {
    icon: Clock,
    title: 'Spaced Repetition',
    description:
      'The SM-2 algorithm schedules each card at the scientifically optimal review interval.',
  },
  {
    icon: Moon,
    title: 'Dark Mode',
    description:
      'A premium Deep Navy dark theme with glassmorphism and neon accents, plus a clean light mode.',
  },
  {
    icon: Smartphone,
    title: 'Cross-Platform',
    description:
      'Fully responsive design works on desktop, tablet, and mobile. Study anywhere.',
  },
];

export function FeatureGrid() {
  const reduced = useReducedMotion();

  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-14 max-w-lg text-center"
        >
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to ace every exam
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for serious students who want real results.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={reduced ? undefined : { opacity: 0, y: 24, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  delay: i * 0.08,
                  type: 'spring',
                  stiffness: 260,
                  damping: 20,
                }}
                whileHover={reduced ? undefined : { y: -4, transition: { duration: 0.2 } }}
                className="glass-card glow-border group rounded-2xl p-6 transition-shadow"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
