import { describe, expect, it } from 'vitest';

import { buttonVariants } from './button';
import { BUTTON_CLASS } from './button-class';
import { cn } from '@/lib/utils';

describe('BUTTON_CLASS', () => {
  it('is exactly what Button renders for each variant the error boundaries use', () => {
    expect(BUTTON_CLASS.default).toBe(cn(buttonVariants()));
    expect(BUTTON_CLASS.primary).toBe(cn(buttonVariants({ variant: 'primary' })));
  });
});
