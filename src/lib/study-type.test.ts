import { describe, expect, it } from 'vitest';
import { studyLength } from './study-type';

describe('studyLength', () => {
  it('keeps short text on the large step up to 110 characters', () => {
    expect(studyLength('')).toBe('lg');
    expect(studyLength('Mitosis')).toBe('lg');
    expect(studyLength('x'.repeat(110))).toBe('lg');
  });

  it('moves to the medium step from 111 to 240 characters', () => {
    expect(studyLength('x'.repeat(111))).toBe('md');
    expect(studyLength('x'.repeat(240))).toBe('md');
  });

  it('uses the small step, the serif floor, from 241 characters', () => {
    expect(studyLength('x'.repeat(241))).toBe('sm');
    expect(studyLength('x'.repeat(2000))).toBe('sm');
  });

  it('ignores surrounding whitespace', () => {
    expect(studyLength(`   ${'x'.repeat(110)}   `)).toBe('lg');
    expect(studyLength('   \n\t  ')).toBe('lg');
  });
});
