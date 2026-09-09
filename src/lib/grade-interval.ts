import { GRADE_MAP, sm2, type SM2Input, type StudyGrade } from './sm2';

const MINUTE_MS = 60_000;

/**
 * Formats a scheduling result in the fewest characters that stay unambiguous:
 * `1m`, `10m`, `4d`, `2mo`, `1y`.
 *
 * Sub-day results are read off `nextReviewAt` rather than `interval`, because
 * SM-2 reports a failed review as `interval: 0` and expresses the real delay as
 * a learning step of 1 or 10 minutes. Reading `interval` alone would render
 * both "again" and "hard" as `0d`, which is both wrong and useless.
 */
export function formatInterval(days: number, nextReviewAt: Date, now: Date = new Date()): string {
  if (days >= 365) return `${Math.round(days / 365)}y`;
  if (days >= 60) return `${Math.round(days / 30)}mo`;
  if (days >= 1) return `${Math.round(days)}d`;

  const minutes = Math.max(1, Math.round((nextReviewAt.getTime() - now.getTime()) / MINUTE_MS));
  if (minutes >= 120) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

/**
 * The real SM-2 consequence of pressing a grade key, so the user sees it
 * *before* commit rather than being told after it (design system §7.4).
 *
 * This runs the actual scheduler rather than a lookup table of guesses — the
 * old study UI showed hard-coded hints like `~2m` that drifted from what the
 * algorithm did.
 */
export function projectedInterval(
  grade: StudyGrade,
  card: SM2Input,
  now: Date = new Date()
): string {
  const result = sm2(GRADE_MAP[grade], card);
  return formatInterval(result.interval, result.nextReviewAt, now);
}
