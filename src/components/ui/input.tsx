import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Design system §7.2 / §9. The edge is --border-control (≥3:1, WCAG 2.2
 * SC 1.4.11) rather than the decorative --border: a field is an operable
 * control and its bounds have to be discoverable without hovering it.
 *
 * Focus is a 2px --accent outline at 2px offset — never a glow. The recipe it
 * replaces expressed focus as a coloured bloom, which reads as a game HUD and
 * disappears entirely against a bright surface.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-ink-dimmer selection:bg-primary selection:text-primary-foreground",
        "h-[44px] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-control)] bg-transparent px-3 py-2 text-sm",
        "transition-[border-color,background-color] duration-[120ms] ease-out outline-hidden",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
