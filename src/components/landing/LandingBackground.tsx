'use client';

import { useEffect, useRef } from 'react';

/**
 * Dynamic Monochromatic Landing Background.
 *
 * An interactive, living environment inspired by neural memory networks and active recall:
 * 1. Living Monochromatic Fluid Lighting (CSS GPU Composited):
 *    - Breathing central specular halo (`ambient-breath`).
 *    - Two floating orbital silver/zinc halos (`float-orb-1`, `float-orb-2`) that drift
 *      continuously across the viewport, giving the dark space visible organic depth.
 * 2. Harmonic Neural Waveforms (Canvas):
 *    - Continuous mathematical harmonic wave ribbons undulating gently across the screen,
 *      reminiscent of EEG brainwaves and synaptic signal transmission.
 * 3. Interactive Constellation & Memory Nodes:
 *    - Drifting memory nodes with organic velocities.
 *    - Dynamic synaptic lines connecting nodes within proximity.
 *    - Interactive mouse resonance: nearby nodes gravitate towards and link to the cursor.
 *    - Dynamic click impulse: clicking anywhere ripples through nearby nodes.
 * 4. Interactive Mouse Specular Halo:
 *    - A soft, smooth-interpolated light follows the cursor to illuminate the obsidian plane.
 * 5. Tactile Film Grain (Fixed SVG Noise):
 *    - Seamless GPU-cached micro-texture preventing digital gradient banding.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseGlowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Check user preference for reduced motion
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse coordinates (actual vs lerped for ultra-smooth tracking)
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      radius: 180,
      active: false,
    };

    // Calculate particle count adaptively
    const area = width * height;
    const count = Math.min(Math.max(Math.floor(area / 15000), 55), 105);

    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const baseRadius = Math.random() * 1.5 + 0.8;
      // Slightly more energetic drift velocity for unmistakable dynamic feel
      const speed = Math.random() * 0.45 + 0.25;
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseRadius,
        radius: baseRadius,
        alpha: Math.random() * 0.45 + 0.3,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.025 + 0.015,
      });
    }

    // High-DPI screen calibration
    function handleResize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx?.scale(dpr, dpr);
    }

    handleResize();

    // Mouse tracking with smooth lerp
    function handleMouseMove(e: MouseEvent) {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;

      if (mouse.x === -1000) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
    }

    function handleMouseLeave() {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
      mouse.active = false;
    }

    // Click impulse shockwave
    function handleClick(e: MouseEvent) {
      const clickX = e.clientX;
      const clickY = e.clientY;

      particles.forEach((p) => {
        const dx = p.x - clickX;
        const dy = p.y - clickY;
        const dist = Math.hypot(dx, dy);
        if (dist < 320 && dist > 0) {
          const force = (320 - dist) / 320;
          p.vx += (dx / dist) * force * 2.6;
          p.vy += (dy / dist) * force * 2.6;
        }
      });
    }

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });

    let isTabVisible = !document.hidden;
    function handleVisibilityChange() {
      isTabVisible = !document.hidden;
      if (isTabVisible && !prefersReducedMotion) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const connectionDistance = 125;
    let lastTime = performance.now();
    let waveTime = 0;

    function render(currentTime: number) {
      if (!ctx || !canvas) return;
      if (!isTabVisible) return;

      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      waveTime += delta;

      // Mouse lerp
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;
      } else {
        mouse.x = -1000;
        mouse.y = -1000;
      }

      // Update interactive mouse spotlight in DOM
      if (mouseGlowRef.current && mouse.active) {
        mouseGlowRef.current.style.transform = `translate3d(${mouse.x - 250}px, ${mouse.y - 250}px, 0)`;
        mouseGlowRef.current.style.opacity = '1';
      } else if (mouseGlowRef.current) {
        mouseGlowRef.current.style.opacity = '0';
      }

      ctx.clearRect(0, 0, width, height);

      // Check current dark mode
      const isDark = document.documentElement.classList.contains('dark');
      const nodeColor = isDark ? '255, 255, 255' : '24, 24, 27';
      const lineColor = isDark ? '255, 255, 255' : '39, 39, 42';

      // ── 1. Dynamic Harmonic Wave Ribbons (Flowing Neural Signals) ──
      // Wave Ribbon 1 (Upper-mid gentle harmonic)
      ctx.beginPath();
      const wave1Y = height * 0.38;
      for (let x = 0; x <= width; x += 10) {
        const y =
          wave1Y +
          Math.sin(x * 0.0028 + waveTime * 0.8) * 42 +
          Math.cos(x * 0.0016 - waveTime * 0.45) * 24;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isDark
        ? 'rgba(255, 255, 255, 0.14)'
        : 'rgba(24, 24, 27, 0.1)';
      ctx.lineWidth = 2.25;
      ctx.stroke();

      // Wave Ribbon 2 (Counter-phase harmonic)
      ctx.beginPath();
      const wave2Y = height * 0.46;
      for (let x = 0; x <= width; x += 10) {
        const y =
          wave2Y +
          Math.sin(x * 0.0022 - waveTime * 0.65 + 1.2) * 50 +
          Math.cos(x * 0.0035 + waveTime * 0.75) * 20;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isDark
        ? 'rgba(255, 255, 255, 0.11)'
        : 'rgba(24, 24, 27, 0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Wave Ribbon 3 (Lower deep wave)
      ctx.beginPath();
      const wave3Y = height * 0.56;
      for (let x = 0; x <= width; x += 12) {
        const y =
          wave3Y +
          Math.sin(x * 0.0018 + waveTime * 0.4 + 2.8) * 58 +
          Math.sin(x * 0.0042 - waveTime * 0.55) * 16;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isDark
        ? 'rgba(255, 255, 255, 0.085)'
        : 'rgba(24, 24, 27, 0.065)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // ── 2. Draw Synaptic Connections between close particles ──
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < connectionDistance) {
            const lineAlpha =
              (1 - dist / connectionDistance) * (isDark ? 0.3 : 0.18);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${lineColor}, ${lineAlpha})`;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }

        // Connect particles to mouse cursor
        if (mouse.active) {
          const dx = particles[i].x - mouse.x;
          const dy = particles[i].y - mouse.y;
          const dist = Math.hypot(dx, dy);

          if (dist < mouse.radius) {
            const mouseLineAlpha =
              (1 - dist / mouse.radius) * (isDark ? 0.5 : 0.32);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(${lineColor}, ${mouseLineAlpha})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
        }
      }

      // ── 3. Update and Draw Particles ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.pulsePhase += p.pulseSpeed;
          const pulse = Math.sin(p.pulsePhase);
          p.radius = p.baseRadius + pulse * 0.45;

          // Mouse proximity slight pull
          if (mouse.active) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < mouse.radius && dist > 0) {
              const pull = (mouse.radius - dist) / mouse.radius;
              p.vx += (dx / dist) * pull * 0.09;
              p.vy += (dy / dist) * pull * 0.09;
            }
          }

          // Damping to prevent runaway speed after clicks
          p.vx *= 0.985;
          p.vy *= 0.985;

          // Velocity caps
          const currentSpeed = Math.hypot(p.vx, p.vy);
          if (currentSpeed > 3.0) {
            p.vx = (p.vx / currentSpeed) * 3.0;
            p.vy = (p.vy / currentSpeed) * 3.0;
          }

          p.x += p.vx * 60 * delta;
          p.y += p.vy * 60 * delta;

          // Smooth boundary wrap
          if (p.x < -12) p.x = width + 12;
          else if (p.x > width + 12) p.x = -12;

          if (p.y < -12) p.y = height + 12;
          else if (p.y > height + 12) p.y = -12;
        }

        // Draw particle dot
        const currentAlpha = p.alpha * (isDark ? 1 : 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${nodeColor}, ${currentAlpha})`;
        ctx.fill();

        // Subtle specular glow halo on larger particles
        if (p.baseRadius > 1.5) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 2.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${nodeColor}, ${currentAlpha * 0.2})`;
          ctx.fill();
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    }

    if (prefersReducedMotion) {
      render(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('click', handleClick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none [--blob:24,24,27] dark:[--blob:255,255,255]"
    >
      {/* ── 1. Film Grain Overlay (Fixed, seamless GPU-cached SVG fractal noise) ── */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.038] dark:opacity-[0.055] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* ── 2. Top Breathing Monochromatic Spotlight ── */}
      <div
        className="absolute left-1/2 -top-[15%] -translate-x-1/2 w-[1400px] sm:w-[1850px] h-[820px] sm:h-[1050px] rounded-full blur-[140px] opacity-60 dark:opacity-100 will-change-transform"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(var(--blob), 0.2) 0%, rgba(var(--blob), 0.08) 45%, rgba(var(--blob), 0.02) 70%, transparent 85%)`,
          animation: 'ambient-breath 8s ease-in-out infinite',
        }}
      />

      {/* ── 3. Floating Orbital Halos (Moving fluid lighting across the screen) ── */}
      {/* Left Orbital Halo */}
      <div
        className="absolute left-[10%] top-[20%] w-[820px] sm:w-[1150px] h-[580px] sm:h-[810px] rounded-full blur-[160px] opacity-55 dark:opacity-80 will-change-transform pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 65% 50% at 50% 50%, rgba(var(--blob), 0.14) 0%, rgba(var(--blob), 0.04) 55%, transparent 80%)`,
          animation: 'float-orb-1 18s ease-in-out infinite',
        }}
      />

      {/* Right Orbital Halo */}
      <div
        className="absolute right-[5%] top-[40%] w-[920px] sm:w-[1280px] h-[580px] sm:h-[870px] rounded-full blur-[170px] opacity-50 dark:opacity-75 will-change-transform pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 50%, rgba(var(--blob), 0.13) 0%, rgba(var(--blob), 0.035) 55%, transparent 80%)`,
          animation: 'float-orb-2 24s ease-in-out infinite',
        }}
      />

      {/* Center Deep Halo */}
      <div
        className="absolute left-1/2 top-[65%] -translate-x-1/2 w-[1040px] sm:w-[1500px] h-[640px] sm:h-[920px] rounded-full blur-[160px] opacity-45 dark:opacity-65 will-change-transform pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 75% 50% at 50% 50%, rgba(var(--blob), 0.1) 0%, transparent 70%)`,
          animation: 'float-orb-3 16s ease-in-out infinite',
        }}
      />

      {/* ── 4. Dynamic Interactive Cursor Spotlight ── */}
      <div
        ref={mouseGlowRef}
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-[110px] pointer-events-none transition-opacity duration-500 ease-out opacity-0"
        style={{
          background:
            'radial-gradient(circle, rgba(var(--blob), 0.1) 0%, rgba(var(--blob), 0.02) 50%, transparent 75%)',
        }}
      />

      {/* ── 5. Interactive Dynamic Canvas (Neural Waveforms & Particle Network) ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* ── 6. Edge Vignette (Soft framing to preserve contrast at viewport edges) ── */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 90% 80% at 50% 40%, transparent 45%, var(--landing-vignette) 100%)',
        }}
      />

      {/* ── 7. Specular Horizon Hairline ── */}
      <div
        className="absolute left-1/2 top-[520px] -translate-x-1/2 w-full max-w-4xl h-[1px] opacity-25 dark:opacity-35 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.08) 40%, transparent 75%)',
        }}
      />
    </div>
  );
}
