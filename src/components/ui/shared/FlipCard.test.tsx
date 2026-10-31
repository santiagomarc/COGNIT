import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FlipCard } from './FlipCard';

const render = (state: 'default' | 'flipping') =>
  renderToStaticMarkup(
    <FlipCard
      state={state}
      prompt="What organelle makes ATP?"
      answer="Mitochondria"
      onReveal={() => {}}
      hint="Press Space to show the answer."
    />
  );

describe('FlipCard accessibility (A11Y-13)', () => {
  it('has no aria-label, so the visible face is the accessible name', () => {
    expect(render('default')).not.toContain('aria-label');
  });

  it('describes the button with the hint instead of naming it', () => {
    const html = render('default');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<span id="${id}" class="sr-only">Press Space to show the answer.</span>`);
  });

  it('hides the face that is turned away', () => {
    const before = render('default');
    expect(before).toMatch(/flip__face--prompt" aria-hidden="false"/);
    expect(before).toMatch(/flip__face--answer" aria-hidden="true"/);
    const after = render('flipping');
    expect(after).toMatch(/flip__face--prompt" aria-hidden="true"/);
    expect(after).toMatch(/flip__face--answer" aria-hidden="false"/);
  });
});
