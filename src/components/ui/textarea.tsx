import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Design system §7.2 / §9 — see the note in `input.tsx`. Same control edge,
 * same 2px --accent focus outline at 2px offset, no glow.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-ink-dimmer selection:bg-primary selection:text-primary-foreground",
        "w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-3 py-2 text-sm",
        "transition-[border-color,background-color] duration-[120ms] ease-out outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        "aria-invalid:border-destructive",
        "min-h-[5rem] resize-y field-sizing-content",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
