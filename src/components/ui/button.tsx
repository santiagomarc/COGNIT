import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Design system §7.2.
 *
 * Two things changed here and both are deliberate:
 *
 * 1. No framer-motion. The old implementation returned an `m.button` with a
 *    `whileTap` spring, which pulled the animation runtime into every page that
 *    rendered a button — including otherwise static server-rendered ones
 *    (defect F-09). A CSS `:active` transform is free and, for a tactile
 *    system, more accurate. This file is no longer a client component.
 *
 * 2. `default` is the neutral outlined control and `primary` is the filled one.
 *    The system spends fill as a scarce resource: one primary button per
 *    screen.
 *
 * 3. Four variants, and only four. Phase 1 kept `outline`, `secondary` and
 *    `link` alive so ~9,800 LOC could re-skin without being edited; that
 *    compatibility layer is now gone. `outline` was byte-identical to
 *    `default` once fill stopped being the default, `link` had no call sites
 *    left, and `secondary` has been replaced by an `aria-pressed` rule below —
 *    a strictly better answer, because a toggle can no longer look pressed
 *    without announcing that it is.
 *
 * Control edges use --border-control (≥3:1), never --border-strong: a button
 * edge is non-text content that carries meaning, so WCAG 2.2 SC 1.4.11 applies.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[var(--radius-control)] font-medium",
    "transition-[background-color,border-color,color] duration-[120ms] ease-out",
    // The tap feedback that used to cost a spring runtime.
    "active:translate-y-px",
    // Every interactive element has a visible focus state (§9).
    "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
    "disabled:pointer-events-none disabled:opacity-50",
    /*
     * A toggle's "on" look is driven by aria-pressed rather than by a separate
     * variant. The `secondary` variant used to carry it, which meant a caller
     * could style a button as pressed without telling assistive technology, or
     * set aria-pressed without it showing. Now one attribute does both.
     */
    "aria-pressed:border-[var(--border-control)] aria-pressed:bg-surface-raised",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "aria-invalid:border-destructive",
  ],
  {
    variants: {
      variant: {
        // The workhorse: a 1px enclosure on the flat ground.
        default:
          "border border-[var(--border-control)] bg-transparent text-ink hover:bg-surface-raised",
        // The one filled button on a screen.
        primary:
          "border border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)]/90",
        // Edge appears only on hover, so a row of them reads as text until used.
        ghost:
          "border border-transparent bg-transparent text-ink hover:border-[var(--border-strong)] hover:bg-surface-raised",
        // Fill is earned here: destructive confirmation is where it matters.
        destructive:
          "border border-[var(--state-lapsed)] bg-[var(--state-lapsed)] font-semibold text-bg hover:bg-[var(--state-lapsed)]/90 focus-visible:outline-[var(--state-lapsed)]",
      },
      size: {
        default: "h-[34px] px-[14px] text-[13px]",
        sm: "h-[30px] gap-1.5 px-3 text-[13px]",
        lg: "h-[38px] px-5 text-sm",
        icon: "size-[34px]",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-[38px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
