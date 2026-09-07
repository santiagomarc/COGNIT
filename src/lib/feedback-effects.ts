'use client';

export type FeedbackKind = 'correct' | 'incorrect' | 'complete';

export type FeedbackPrefs = { sound: boolean; haptics: boolean };

const STORAGE_KEY = 'cognit-feedback-prefs';

/**
 * Haptics ON, sound OFF.
 *
 * Vibration is invisible on desktop and unimplemented in iOS Safari, so it
 * degrades to nothing and costs the user nothing. Sound in a library or a
 * lecture hall is a liability — make them ask for it.
 */
export const DEFAULT_FEEDBACK_PREFS: FeedbackPrefs = { sound: false, haptics: true };

export function loadFeedbackPrefs(): FeedbackPrefs {
  if (typeof window === 'undefined') return DEFAULT_FEEDBACK_PREFS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FEEDBACK_PREFS;

    const parsed = JSON.parse(raw) as Partial<FeedbackPrefs>;
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_FEEDBACK_PREFS.sound,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_FEEDBACK_PREFS.haptics,
    };
  } catch {
    // Private mode, or storage disabled entirely.
    return DEFAULT_FEEDBACK_PREFS;
  }
}

export function saveFeedbackPrefs(prefs: FeedbackPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Non-fatal: the preference just won't survive a reload.
  }
}

/**
 * Tones are synthesised with WebAudio rather than shipped as files: three short
 * tones cost zero bundle bytes and zero network requests, and the AudioContext
 * is created lazily on first use so autoplay policy is satisfied by the user's
 * own click.
 */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }

  return audioContext;
}

const TONES: Record<FeedbackKind, { frequencies: number[]; duration: number; gain: number }> = {
  // Rising perfect fifth — reads as "yes" without sounding like a game show.
  correct: { frequencies: [523.25, 783.99], duration: 0.09, gain: 0.05 },
  // A single low tone, deliberately NOT a harsh buzz. Getting it wrong is the
  // point of the exercise and should not feel like punishment.
  incorrect: { frequencies: [196.0], duration: 0.13, gain: 0.04 },
  complete: { frequencies: [523.25, 659.25, 783.99, 1046.5], duration: 0.11, gain: 0.05 },
};

export function playFeedbackSound(kind: FeedbackKind, enabled: boolean) {
  if (!enabled) return;

  const context = getAudioContext();
  if (!context) return;

  const tone = TONES[kind];

  tone.frequencies.forEach((frequency, index) => {
    const startAt = context.currentTime + index * tone.duration * 0.8;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);

    // An exponential ramp avoids the click a hard gain cutoff produces.
    gain.gain.setValueAtTime(tone.gain, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + tone.duration);
  });
}

const VIBRATION: Record<FeedbackKind, number | number[]> = {
  correct: 12,                  // barely perceptible tap
  incorrect: [18, 40, 18],      // short double-pulse
  complete: [20, 50, 20, 50, 40],
};

export function triggerHaptic(kind: FeedbackKind, enabled: boolean) {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  // iOS Safari does not implement navigator.vibrate, so this is a silent no-op
  // there — which is exactly why haptics can default to on.
  navigator.vibrate(VIBRATION[kind]);
}

export function fireFeedback(kind: FeedbackKind, prefs: FeedbackPrefs) {
  playFeedbackSound(kind, prefs.sound);
  triggerHaptic(kind, prefs.haptics);
}

/* ─── React binding ─── */

// A module-level cache keeps getSnapshot referentially stable. Returning a new
// object each call would make useSyncExternalStore loop forever.
let cachedPrefs: FeedbackPrefs | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FeedbackPrefs {
  if (!cachedPrefs) cachedPrefs = loadFeedbackPrefs();
  return cachedPrefs;
}

// The server has no localStorage, so it renders the defaults. useSyncExternalStore
// swaps in the stored value after hydration without a mismatch warning.
function getServerSnapshot(): FeedbackPrefs {
  return DEFAULT_FEEDBACK_PREFS;
}

export function setFeedbackPrefs(next: FeedbackPrefs) {
  cachedPrefs = next;
  saveFeedbackPrefs(next);
  listeners.forEach((listener) => listener());
}

export { subscribe as subscribeToFeedbackPrefs, getSnapshot as getFeedbackPrefsSnapshot, getServerSnapshot as getFeedbackPrefsServerSnapshot };
