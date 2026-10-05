/**
 * The study card face's type step. A one-line term and a three-sentence
 * definition cannot share a font size: the size that suits the first hides
 * half of the second on a phone. Serif never goes below 24px (design system
 * §3.3), so longer text gets a smaller step and a wider measure, not a smaller
 * floor. The steps themselves live in `globals.css` as `--type-study-*`.
 */
export type StudyLength = 'lg' | 'md' | 'sm';

/** Longest text that still takes the large step, in characters. */
export const STUDY_LENGTH_LG_MAX = 110;
/** Longest text that still takes the medium step, in characters. */
export const STUDY_LENGTH_MD_MAX = 240;

/**
 * Counts characters of the raw card text. Markup is short and rare in
 * cards, so counting it is a better trade than rendering to measure.
 */
export function studyLength(text: string): StudyLength {
  const length = text.trim().length;
  if (length <= STUDY_LENGTH_LG_MAX) return 'lg';
  return length <= STUDY_LENGTH_MD_MAX ? 'md' : 'sm';
}
