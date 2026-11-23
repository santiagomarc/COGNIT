/**
 * Paging for the deck's Cards tab. The client holds a list in server order
 * (newest first) that is always a contiguous prefix of the deck, and shows one
 * page of it. A prefix keeps everything else simple: a page is a slice, a
 * card's number is its distance from the end, and the next read's offset is
 * the list's length.
 */

/** Fills whole rows at one, two and three columns. */
export const CARDS_PER_PAGE = 12;

/** The most cards one delete may name; the Cards tab and the action both hold to it. */
export const BULK_DELETE_MAX_COUNT = 200;

export type CardList<T> = { cards: T[]; total: number };

export function pageCount(total: number, perPage = CARDS_PER_PAGE) {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The page actually shown: a delete or a narrower filter can leave the asked-for page past the end. */
export function clampPage(page: number, pages: number) {
  return Math.min(Math.max(1, page), pages);
}

/**
 * The pager's slots. Above seven pages it is always seven slots, so the
 * buttons don't move under the pointer from one page to the next.
 */
export function pageItems(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', pages];
  if (page >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages];
}

/**
 * Adds the next chunk the server returned. A chunk with nothing new means the
 * list is complete whatever the count said, so the total follows the list;
 * otherwise the caller would ask for the same chunk forever.
 */
export function appendCards<T extends { id: string }>(list: CardList<T>, chunk: T[], serverTotal: number): CardList<T> {
  const known = new Set(list.cards.map((card) => card.id));
  const added = chunk.filter((card) => !known.has(card.id));
  if (added.length === 0) return { cards: list.cards, total: list.cards.length };
  const cards = [...list.cards, ...added];
  return { cards, total: Math.max(serverTotal, cards.length) };
}

/**
 * The server re-read the first cards (after an edit, an add or a delete).
 * Cards already loaded past them are kept when the two still join up, so a
 * refresh on page 8 doesn't empty page 8; otherwise they are read again.
 */
export function refreshFirstCards<T extends { id: string }>(list: CardList<T>, first: T[], total: number): CardList<T> {
  const last = first.at(-1);
  const joint = last ? list.cards.findIndex((card) => card.id === last.id) : -1;
  if (joint === -1) return { cards: first, total };
  const fresh = new Set(first.map((card) => card.id));
  const rest = list.cards.slice(joint + 1).filter((card) => !fresh.has(card.id));
  return { cards: [...first, ...rest].slice(0, total), total };
}

export function dropCards<T extends { id: string }>(list: CardList<T>, ids: ReadonlySet<string>): CardList<T> {
  const cards = list.cards.filter((card) => !ids.has(card.id));
  return { cards, total: list.total - (list.cards.length - cards.length) };
}
