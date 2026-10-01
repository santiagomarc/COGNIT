import { describe, expect, it } from 'vitest';

import { drillSessionHref } from './links';

describe('drillSessionHref', () => {
  it('launches up to three drills and pulls cards forward', () => {
    expect(drillSessionHref('d1', 7)).toBe('/dashboard/d1/synthesis?count=3&pull=1');
    expect(drillSessionHref('d1', 2)).toBe('/dashboard/d1/synthesis?count=2&pull=1');
  });

  it('never asks for fewer than one', () => {
    expect(drillSessionHref('d1', 0)).toBe('/dashboard/d1/synthesis?count=1&pull=1');
    expect(drillSessionHref('d1', Number.NaN)).toBe('/dashboard/d1/synthesis?count=1&pull=1');
  });
});
