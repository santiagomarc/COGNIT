/*
 * Subject tags are a label, not a colour.
 *
 * This list used to be a map of tag → `rgba(…)` glow, and every one of those
 * ten values was a hue outside the state channel and a hard-coded colour in a
 * module (§2.2, §2.3). The dashboard drew them as a shadow behind each deck
 * tile and as a tinted chip; the deck row renders the tag as text in the label
 * step instead, so the colours had no remaining consumer.
 */
const DECK_TAGS = [
  'ai',
  'cs',
  'math',
  'bio',
  'chem',
  'physics',
  'history',
  'language',
  'law',
  'business',
] as const;

export const DECK_TAG_OPTIONS = [
  { value: 'ai', label: 'AI' },
  { value: 'cs', label: 'Computer Science' },
  { value: 'math', label: 'Mathematics' },
  { value: 'bio', label: 'Biology' },
  { value: 'chem', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
  { value: 'history', label: 'History' },
  { value: 'language', label: 'Language' },
  { value: 'law', label: 'Law' },
  { value: 'business', label: 'Business' },
] as const;

export type DeckTag = (typeof DECK_TAGS)[number];

export const DECK_TAG_VALUES: DeckTag[] = [...DECK_TAGS];

const DECK_TAG_PREFIX_REGEX = /^\s*(?:\[([a-z0-9-]{2,20})\]|#([a-z0-9-]{2,20}))\s*/i;

export function normalizeDeckTag(value: string | null | undefined): DeckTag | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9-]{2,20}$/.test(normalized)) {
    return null;
  }

  if (DECK_TAG_VALUES.includes(normalized as DeckTag)) {
    return normalized as DeckTag;
  }

  return null;
}

export function parseDeckTitleMetadata(title: string) {
  const rawTitle = title ?? '';
  const match = rawTitle.match(DECK_TAG_PREFIX_REGEX);
  const extracted = match ? match[1] ?? match[2] : null;
  const tag = normalizeDeckTag(extracted);
  const cleanTitle = rawTitle.replace(DECK_TAG_PREFIX_REGEX, '').trim();

  return {
    tag,
    cleanTitle: cleanTitle || rawTitle.trim(),
  };
}

export function removeDeckTagFromTitle(title: string) {
  return parseDeckTitleMetadata(title).cleanTitle;
}

export function buildDeckTitleWithTag(title: string, tag?: string | null) {
  const baseTitle = removeDeckTagFromTitle(title).trim();
  const normalizedTag = normalizeDeckTag(tag);

  if (!baseTitle) {
    return '';
  }

  if (!normalizedTag) {
    return baseTitle;
  }

  return `[${normalizedTag}] ${baseTitle}`;
}
