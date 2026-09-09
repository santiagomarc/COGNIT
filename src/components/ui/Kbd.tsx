import * as React from 'react';

import { cn } from '@/lib/utils';

type KbdProps = React.ComponentProps<'kbd'>;

/**
 * A keycap (design system §7.3).
 *
 * Cognit has eight keyboard bindings and used to render two keycaps, both
 * `hidden sm:inline-flex` — the affordances were absent exactly where the
 * user's hands were (defect F-05).
 *
 * Two rules come with this primitive:
 *
 *  1. **Bind the keycap to the control it triggers**, not to a hint strip in
 *     the footer. A legend the user has to correlate with a button is not a
 *     discovery aid.
 *  2. **Never hide it responsively.** A mobile user with a hardware keyboard
 *     benefits from seeing that the binding exists, and hiding it is how the
 *     bindings became invisible in the first place.
 *
 * Rendered as a real `<kbd>`, so assistive technology announces it as key
 * input rather than as decorative text.
 */
export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd className={cn('kbd', className)} {...props}>
      {children}
    </kbd>
  );
}
