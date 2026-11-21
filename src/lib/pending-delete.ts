/*
 * Act now, commit later (UIUX plan FB-01). The caller hides the rows at once
 * and shows an Undo toast; the server call waits out the toast. Undo cancels
 * it, so a regretted delete never reaches the server. Decks and drills already
 * worked this way through the trash; cards now do too, without a schema change.
 *
 * The commit also runs on `pagehide`, as a best effort: a request started while
 * the tab closes may not land, and then nothing is deleted, which is the safe
 * direction.
 */
export const PENDING_DELETE_MS = 6_000;

export type PendingDelete = {
  /** Cancels the delete. Returns false when it had already been sent. */
  undo: () => boolean;
  /** Sends the delete now instead of waiting. */
  flush: () => void;
};

type Options = {
  /** Performs the delete; resolves to an error message, or null on success. */
  commit: () => Promise<string | null>;
  onCommitted?: () => void;
  onFailed?: (message: string) => void;
  delayMs?: number;
};

export function schedulePendingDelete({ commit, onCommitted, onFailed, delayMs = PENDING_DELETE_MS }: Options): PendingDelete {
  let settled = false;

  const send = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', send);
    void commit()
      .then((error) => (error ? onFailed?.(error) : onCommitted?.()))
      .catch(() => onFailed?.('The delete failed. Please try again.'));
  };

  const timer = setTimeout(send, delayMs);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', send);

  return {
    undo: () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', send);
      return true;
    },
    flush: send,
  };
}
