'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

type MasteryConfettiProps = {
  active: boolean;
  /** Scales particle count. 1 for a strong pass, higher for a perfect score. */
  intensity?: number;
};

/**
 * Canvas confetti with no dependency and no layout impact.
 *
 * Suppressed entirely under prefers-reduced-motion — a burst of moving
 * particles is precisely what that setting exists to prevent.
 */
export function MasteryConfetti({ active, intensity = 1 }: MasteryConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active || reduced) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);

    const colors = ['#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f472b6'];
    const particles = Array.from({ length: Math.round(90 * intensity) }, () => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 4,
      size: Math.random() * 6 + 3,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    }));

    let frame = 0;
    let raf = 0;

    const tick = () => {
      context.clearRect(0, 0, width, height);
      frame += 1;

      for (const particle of particles) {
        particle.vy += 0.28;        // gravity
        particle.vx *= 0.99;        // drag
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.spin;
        particle.life = Math.max(0, 1 - frame / 150);

        if (particle.life <= 0) continue;

        context.save();
        context.globalAlpha = particle.life;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
        context.restore();
      }

      if (frame < 150) {
        raf = requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, intensity, reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
}
