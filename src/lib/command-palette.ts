/**
 * Command palette data (§8, task 8.4).
 *
 * Kept pure and separate from the dialog so the thing that decides *what the
 * palette offers* can be tested without a DOM. The dialog itself is the
 * existing semantic-search modal grown into a launcher — there is exactly one
 * modal implementation in the navigation layer, not two.
 */

export type PaletteGroup = 'Actions' | 'Decks';

export type PaletteCommand = {
  id: string;
  /** What the row reads. */
  label: string;
  /** Right-aligned mono annotation — a count, a route, a shortcut. */
  hint?: string;
  group: PaletteGroup;
  /** Extra words the query may match. Never rendered. */
  keywords?: string;
  /** Where a navigation command goes. Absent on commands that are not routes. */
  href?: string;
  /** Non-navigation commands name their effect for the dialog to dispatch. */
  effect?: 'new-deck' | 'toggle-theme' | 'sign-out';
};

export type PaletteDeck = {
  id: string;
  /** Already stripped of its `[tag]` prefix by the caller. */
  title: string;
  dueCount: number;
};

export type BuildPaletteInput = {
  decks: PaletteDeck[];
  /** Where "start session" goes. Null when the account has no decks at all. */
  sessionHref: string | null;
  totalDue: number;
  /** Rendered verbatim, so the caller owns the wording for the current theme. */
  themeCommandLabel: string;
};

/**
 * The palette's full command set, before filtering.
 *
 * Order is deliberate and does not re-rank on query: a palette whose rows move
 * under the cursor cannot be used by muscle memory. Filtering removes rows; it
 * never reorders them.
 */
export function buildPaletteCommands({
  decks,
  sessionHref,
  totalDue,
  themeCommandLabel,
}: BuildPaletteInput): PaletteCommand[] {
  const commands: PaletteCommand[] = [];

  if (sessionHref) {
    commands.push({
      id: 'start-session',
      label: totalDue > 0 ? 'Start session' : 'Study ahead',
      hint: totalDue > 0 ? `${totalDue} due` : undefined,
      group: 'Actions',
      keywords: 'study review flashcards session start',
      href: sessionHref,
    });
  }

  commands.push(
    {
      id: 'decks',
      label: 'Go to decks',
      hint: '/dashboard',
      group: 'Actions',
      keywords: 'dashboard index home library',
      href: '/dashboard',
    },
    {
      id: 'new-deck',
      label: 'New deck',
      group: 'Actions',
      keywords: 'create add deck new',
      effect: 'new-deck',
    },
    {
      id: 'toggle-theme',
      label: themeCommandLabel,
      group: 'Actions',
      keywords: 'theme dark light appearance mode',
      effect: 'toggle-theme',
    },
    {
      id: 'sign-out',
      label: 'Sign out',
      group: 'Actions',
      keywords: 'log out logout exit account session end',
      effect: 'sign-out',
    }
  );

  for (const deck of decks) {
    commands.push({
      id: `deck:${deck.id}`,
      label: deck.title,
      hint: deck.dueCount > 0 ? `${deck.dueCount} due` : undefined,
      group: 'Decks',
      keywords: 'deck open',
      href: `/dashboard/${deck.id}`,
    });
  }

  return commands;
}

function haystack(command: PaletteCommand) {
  return `${command.label} ${command.keywords ?? ''} ${command.group}`.toLowerCase();
}

/**
 * Every whitespace-separated token in the query must appear somewhere in the
 * row's label, keywords or group. Substring rather than fuzzy: a palette that
 * matches loosely surfaces "Sign out" for "s" and puts a destructive command
 * under an accidental Enter.
 */
export function filterPaletteCommands(
  commands: PaletteCommand[],
  query: string
): PaletteCommand[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;

  return commands.filter((command) => {
    const text = haystack(command);
    return tokens.every((token) => text.includes(token));
  });
}

/** The palette's rows, in render order, grouped under their headings. */
export function groupPaletteCommands(
  commands: PaletteCommand[]
): Array<{ group: PaletteGroup; commands: PaletteCommand[] }> {
  const sections: Array<{ group: PaletteGroup; commands: PaletteCommand[] }> = [];

  for (const command of commands) {
    const last = sections[sections.length - 1];
    if (last && last.group === command.group) {
      last.commands.push(command);
      continue;
    }
    sections.push({ group: command.group, commands: [command] });
  }

  return sections;
}
