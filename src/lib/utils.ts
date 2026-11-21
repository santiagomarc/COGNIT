import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * The `type-*` utilities in globals.css set font-size, so tailwind-merge has to
 * know them as the font-size group. Without this, `cn("text-sm", "type-cap")`
 * keeps both and CSS order picks the winner; with it, the later one wins, as
 * `cn("text-sm", "text-[12px]")` always did (UIUX plan DS-08).
 */
const TYPE_STEPS = [
  "h3", "body", "sm", "cap", "label",
  "display-xl", "display-lg", "display", "display-md", "display-sm", "hero",
  "study-lg", "study-md", "study-sm",
  "readout-lg", "readout", "readout-sm",
]

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ type: TYPE_STEPS }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
