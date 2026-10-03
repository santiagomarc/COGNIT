/**
 * Every keyboard shortcut the app answers to, in one list (sidebar plan
 * §5.7, SET-06). The shortcuts dialog (`?`) and Settings → Keyboard
 * shortcuts both render from here, so what is documented is what exists.
 *
 * This is documentation, not wiring: each binding still lives in the
 * component that owns it (the file is named per row), and every one of those
 * handlers calls `pageShortcutBlocked` first. A binding added without a row
 * here is a bug the review should catch.
 */

export type ShortcutScope = 'Anywhere' | 'Today' | 'Deck page' | 'Study' | 'Quiz' | 'Drill';

export type Shortcut = {
  id: string;
  /** Rendered as one keycap per entry. `Mod` renders ⌘ on Apple platforms, Ctrl elsewhere. */
  keys: readonly string[];
  label: string;
  scope: ShortcutScope;
  /** The component that binds it. */
  owner: string;
};

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'search', keys: ['Mod', 'K'], label: 'Search', scope: 'Anywhere', owner: 'CommandPalette' },
  { id: 'new-deck', keys: ['Mod', 'N'], label: 'New deck', scope: 'Anywhere', owner: 'CreateDeckModal' },
  { id: 'shortcuts', keys: ['?'], label: 'Keyboard shortcuts', scope: 'Anywhere', owner: 'KeyboardShortcutsDialog' },
  { id: 'start-session', keys: ['S'], label: 'Start session', scope: 'Today', owner: 'DueNowBand' },
  { id: 'review-deck', keys: ['R'], label: 'Review this deck', scope: 'Deck page', owner: 'DeckReviewHotkey' },
  { id: 'flip', keys: ['Space'], label: 'Flip card', scope: 'Study', owner: 'FlashcardReviewClient' },
  { id: 'grade', keys: ['1', '2', '3', '4'], label: 'Grade: again, hard, good, easy', scope: 'Study', owner: 'FlashcardReviewClient' },
  { id: 'study-pause', keys: ['P'], label: 'Pause', scope: 'Study', owner: 'FlashcardReviewClient' },
  { id: 'quiz-answer', keys: ['1', '2', '3', '4'], label: 'Pick an answer', scope: 'Quiz', owner: 'MCQMode' },
  { id: 'quiz-pause', keys: ['P'], label: 'Pause', scope: 'Quiz', owner: 'QuizAssessmentClient' },
  { id: 'drill-check', keys: ['Mod', 'Enter'], label: 'Check your answer', scope: 'Drill', owner: 'SynthesisDrillClient' },
  { id: 'drill-confidence', keys: ['1', '2', '3'], label: 'Set confidence', scope: 'Drill', owner: 'SynthesisDrillClient' },
  { id: 'drill-skip', keys: ['S'], label: 'Skip', scope: 'Drill', owner: 'SynthesisDrillClient' },
  { id: 'drill-revise', keys: ['R'], label: 'Revise', scope: 'Drill', owner: 'SynthesisDrillClient' },
  { id: 'drill-next', keys: ['N'], label: 'Next drill', scope: 'Drill', owner: 'SynthesisDrillClient' },
];

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['Anywhere', 'Today', 'Deck page', 'Study', 'Quiz', 'Drill'];

/** Shortcuts grouped by scope, in SHORTCUT_SCOPES order, empty scopes dropped. */
export function groupShortcuts(shortcuts: readonly Shortcut[] = SHORTCUTS): Array<{ scope: ShortcutScope; shortcuts: Shortcut[] }> {
  return SHORTCUT_SCOPES.map((scope) => ({ scope, shortcuts: shortcuts.filter((shortcut) => shortcut.scope === scope) })).filter(
    (group) => group.shortcuts.length > 0,
  );
}

/** A keycap's text. `apple` comes from the client (navigator); the server renders Ctrl-neutral "Mod". */
export function keycapLabel(key: string, apple: boolean): string {
  if (key === 'Mod') return apple ? '⌘' : 'Ctrl';
  if (key === 'Enter') return apple ? '↩' : 'Enter';
  return key;
}

/** `?` opens the shortcuts dialog. Shift is how `?` is typed, so it is allowed; other modifiers are not. */
export function isShortcutsHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey;
}
