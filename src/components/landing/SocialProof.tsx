'use client';

import { useInView, useReducedMotion } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

import { RevealOnScroll } from '@/components/motion';

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      requestAnimationFrame(() => setValue(target));
      return;
    }

    const duration = 1600; // ms
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [inView, target, reduced]);

  return (
    <span ref={ref}>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

/*
 * Icons removed (§6): the three glyphs were interchangeable decoration beside
 * numbers that already say what they are. The counter itself stays — a number
 * counting up is a legitimate reading of "a number is a better badge", and it
 * is already gated on `prefers-reduced-motion`.
 *
 * The values are the product's existing marketing claims, carried over
 * unchanged. They are not sourced from anything in this codebase; see the
 * run report — they need substantiating or removing before launch, and that
 * is a business decision rather than a design one.
 */
const stats = [
  { value: 10000, suffix: '+', label: 'Active students' },
  { value: 2000000, suffix: '+', label: 'Cards studied' },
  { value: 49, suffix: '', label: 'Average rating', display: '4.9' },
];

export function SocialProof() {
  return (
    <section className="border-y border-border py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <RevealOnScroll
              key={stat.label}
              delay={i * 0.08}
              className="flex flex-col items-center text-center"
            >
              <p className="font-mono text-3xl font-semibold tracking-[-.03em] tnum text-ink sm:text-4xl">
                {stat.display ?? <AnimatedCounter target={stat.value} suffix={stat.suffix} />}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                {stat.label}
              </p>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
