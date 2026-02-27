'use client';

import { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';

type FlashcardProps = {
  question: string;
  answer: string;
};

export function Flashcard({ question, answer }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // ─── Tilt-toward-cursor hover effect ───
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), {
    stiffness: 300,
    damping: 30,
  });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <motion.button
      type="button"
      onClick={() => setIsFlipped((prev) => !prev)}
      className="group w-full text-left perspective-1000"
      aria-label="Flip flashcard"
      aria-pressed={isFlipped}
      whileTap={{ scale: 0.97 }}
    >
      <motion.div
        ref={cardRef}
        className="relative h-56 w-full"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div
          className="relative h-full w-full"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Front face (Question) */}
          <div
            className="backface-hidden absolute inset-0 rounded-2xl border border-primary/20 bg-card/60 backdrop-blur-xl p-6 text-card-foreground shadow-lg transition-shadow duration-300 group-hover:shadow-[0_0_24px_-4px_var(--glow)]"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Question</p>
            </div>
            <p className="line-clamp-6 text-base leading-relaxed">{question}</p>
          </div>

          {/* Back face (Answer), pre-rotated 180deg so it appears when parent flips */}
          <div
            className="backface-hidden rotate-y-180 absolute inset-0 rounded-2xl border border-neon/30 bg-card/60 backdrop-blur-xl p-6 text-card-foreground shadow-lg transition-shadow duration-300 group-hover:shadow-[0_0_24px_-4px_var(--glow)]"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-widest text-neon/80">Answer</p>
            </div>
            <p className="line-clamp-6 text-base leading-relaxed text-foreground/90">{answer}</p>
          </div>
        </motion.div>
      </motion.div>
    </motion.button>
  );
}
