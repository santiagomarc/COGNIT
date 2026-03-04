'use client';

import { Rocket, ArrowLeft, Home, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { StaggerContainer, StaggerItem, FadeInUp } from '@/components/motion';

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -top-10 -left-10 h-64 w-64 rounded-full bg-primary/10 blur-[100px]"
        />
        <motion.div
          animate={{
            y: [0, 20, 0],
            rotate: [0, -5, 0],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-neon/10 blur-[100px]"
        />
        
        {/* Floating Sparks */}
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-2 w-2 rounded-full bg-primary/40 shadow-[0_0_10px_var(--neon)]"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, Math.random() * -100 - 50],
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 2 + 3,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <StaggerContainer className="z-10 w-full max-w-lg">
        <div className="glass-card glow-border mx-auto rounded-3xl p-10 text-center relative overflow-hidden backdrop-blur-xl">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

          <StaggerItem>
            <motion.div 
              className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 relative"
              animate={{ 
                y: [0, -10, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Rocket className="h-10 w-10 text-primary" strokeWidth={1.5} />
              <motion.div
                animate={{
                  opacity: [0.5, 1, 0.5],
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute -bottom-2 -right-2"
              >
                <Sparkles className="h-5 w-5 text-neon" />
              </motion.div>
            </motion.div>
          </StaggerItem>

          <StaggerItem>
            <h1 className="glow-title text-8xl font-black tracking-tighter bg-gradient-to-br from-primary via-neon to-primary/60 bg-clip-text text-transparent mb-2">
              404
            </h1>
          </StaggerItem>
          
          <StaggerItem>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Lost in Space</h2>
          </StaggerItem>
          
          <StaggerItem>
            <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
              The neural pathway you're trying to access doesn't exist in our memory banks.
            </p>
          </StaggerItem>

          <StaggerItem className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button className="w-full gap-2 group">
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Return to Dashboard
              </Button>
            </Link>
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full gap-2">
                <Home className="h-4 w-4" />
                Home Node
              </Button>
            </Link>
          </StaggerItem>
        </div>
      </StaggerContainer>
    </div>
  );
}
