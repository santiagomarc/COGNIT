const DECK_TAG_GLOW_COLORS = {
  ai: 'rgba(139, 92, 246, 0.36)',
  cs: 'rgba(59, 130, 246, 0.36)',
  math: 'rgba(14, 165, 233, 0.36)',
  bio: 'rgba(16, 185, 129, 0.36)',
  chem: 'rgba(6, 182, 212, 0.35)',
  physics: 'rgba(245, 158, 11, 0.35)',
  history: 'rgba(249, 115, 22, 0.35)',
  language: 'rgba(236, 72, 153, 0.34)',
  law: 'rgba(168, 85, 247, 0.34)',
  business: 'rgba(34, 197, 94, 0.34)',
} as const;

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

export type DeckTag = keyof typeof DECK_TAG_GLOW_COLORS;

export const DECK_TAG_VALUES = Object.keys(DECK_TAG_GLOW_COLORS) as DeckTag[];

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

export function getDeckTagGlowColor(tag: string | null | undefined) {
  const normalizedTag = normalizeDeckTag(tag);
  if (!normalizedTag) {
    return null;
  }

  return DECK_TAG_GLOW_COLORS[normalizedTag] ?? null;
}
