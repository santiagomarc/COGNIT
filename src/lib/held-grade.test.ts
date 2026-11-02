import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeldGrade, UNDO_WINDOW_MS } from './held-grade';

describe('createHeldGrade', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const sent: string[] = [];
    const changes: Array<string | null> = [];
    const held = createHeldGrade<string>({ onRelease: (job) => sent.push(job), onChange: (job) => changes.push(job) });
    return { held, sent, changes };
  }

  it('holds the newest grade and sends it when the window closes', () => {
    const { held, sent } = setup();
    held.hold('a');
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['a']);
    expect(held.isHolding()).toBe(false);
  });

  it('sends the first grade at once when a second is held, and the second after the window', () => {
    const { held, sent } = setup();
    held.hold('a');
    vi.advanceTimersByTime(1_000);
    held.hold('b');
    expect(sent).toEqual(['a']);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(sent).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['a', 'b']);
  });

  it('undo inside the window returns the job and never sends it', () => {
    const { held, sent } = setup();
    held.hold('a');
    vi.advanceTimersByTime(2_000);
    expect(held.undo()).toBe('a');
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(sent).toEqual([]);
  });

  it('undo after the window is a no-op', () => {
    const { held, sent } = setup();
    held.hold('a');
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(held.undo()).toBeNull();
    expect(sent).toEqual(['a']);
  });

  it('flush sends the held job now (Save & exit, tab hidden) and only once', () => {
    const { held, sent } = setup();
    held.hold('a');
    held.flush();
    held.flush();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(sent).toEqual(['a']);
  });

  it('discard drops the job without sending it', () => {
    const { held, sent } = setup();
    held.hold('a');
    held.discard();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(sent).toEqual([]);
    expect(held.isHolding()).toBe(false);
  });

  it('reports each change so the UI can offer and withdraw Undo', () => {
    const { held, changes } = setup();
    held.hold('a');
    held.undo();
    held.hold('b');
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(changes).toEqual(['a', null, 'b', null]);
  });
});
