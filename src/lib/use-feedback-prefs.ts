'use client';

import { useSyncExternalStore } from 'react';
import {
  getFeedbackPrefsServerSnapshot,
  getFeedbackPrefsSnapshot,
  setFeedbackPrefs,
  subscribeToFeedbackPrefs,
  type FeedbackPrefs,
} from '@/lib/feedback-effects';

/**
 * Reads the persisted sound/haptics preferences.
 *
 * useSyncExternalStore rather than useEffect + setState: it avoids the
 * cascading-render lint rule and, more importantly, avoids a hydration mismatch
 * on the toggle's aria-pressed state.
 */
export function useFeedbackPrefs(): [FeedbackPrefs, (next: FeedbackPrefs) => void] {
  const prefs = useSyncExternalStore(
    subscribeToFeedbackPrefs,
    getFeedbackPrefsSnapshot,
    getFeedbackPrefsServerSnapshot,
  );

  return [prefs, setFeedbackPrefs];
}
