'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * True while a scroll container has more content below its fold.
 *
 * A thin scrollbar is the only cue a scrolling card face gives by default, and
 * on a phone it is overlaid and invisible until touched. This drives a fade
 * and a "More below" label so the user knows the text goes on.
 */
export function useOverflowBelow(ref: RefObject<HTMLElement | null>): boolean {
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    // The container's own box does not change when its text does, so watch the
    // children too (the face's text, and a mnemonic when there is one).
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener('scroll', measure, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [ref]);

  return below;
}
