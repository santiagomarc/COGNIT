import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_DELETE_MS, schedulePendingDelete } from './pending-delete';

describe('schedulePendingDelete (FB-01)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits once the undo window has passed, and not before', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const onCommitted = vi.fn();
    schedulePendingDelete({ commit, onCommitted });

    await vi.advanceTimersByTimeAsync(PENDING_DELETE_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it('undo inside the window means the server is never called', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const pending = schedulePendingDelete({ commit });

    expect(pending.undo()).toBe(true);
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('undo after the commit has been sent reports that it was too late', async () => {
    const pending = schedulePendingDelete({ commit: vi.fn().mockResolvedValue(null) });
    pending.flush();
    expect(pending.undo()).toBe(false);
  });

  it('flush sends at once and only once', async () => {
    const commit = vi.fn().mockResolvedValue(null);
    const pending = schedulePendingDelete({ commit });
    pending.flush();
    pending.flush();
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete so the caller can put the rows back', async () => {
    const onFailed = vi.fn();
    schedulePendingDelete({ commit: vi.fn().mockResolvedValue('Failed to delete card'), onFailed });
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_MS);
    expect(onFailed).toHaveBeenCalledWith('Failed to delete card');
  });

  it('reports a thrown delete the same way', async () => {
    const onFailed = vi.fn();
    schedulePendingDelete({ commit: vi.fn().mockRejectedValue(new Error('network')), onFailed });
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_MS);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
