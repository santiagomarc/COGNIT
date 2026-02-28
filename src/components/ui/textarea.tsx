import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input/50 dark:border-primary/15 w-full min-w-0 rounded-lg border bg-card/40 backdrop-blur-sm px-3 py-2 text-base shadow-xs transition-all duration-200 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-glow focus-visible:shadow-[0_0_16px_-2px_var(--glow)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "min-h-[5rem] resize-y field-sizing-content",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
