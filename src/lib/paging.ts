/**
 * Page numbers that cannot crash a query (pure).
 *
 * WHY THIS EXISTS
 *
 * Every list screen reads `?page=` straight off the URL with `Number(x) || 1`.
 * That is fine for junk ("abc" → NaN → 1) and wrong for a negative: -5 is
 * truthy, so it survives, and `(page - 1) * perPage` becomes a negative `skip`.
 * Prisma refuses a negative skip — "Value can only be positive" — so a
 * hand-edited URL turns an ordinary list into a 500 instead of page one.
 *
 * The clamp belongs here rather than on each screen: there are seven of them,
 * and the eighth will be written the same careless way. A repository that
 * cannot be handed an impossible page is the version that stays fixed.
 */

/** A usable 1-based page number, whatever arrived. */
export function safePage(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  // Math.floor so `?page=2.7` is page 2 rather than a fractional skip.
  return Math.max(1, Math.min(Math.floor(n), 1_000_000));
}

/** A page size inside sane bounds, so `?perPage=1e9` cannot ask for the table. */
export function safePerPage(value: unknown, fallback: number, max = 500): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

/** The `skip` for a page, never negative and never fractional. */
export function pageSkip(page: unknown, perPage: number): number {
  return (safePage(page) - 1) * Math.max(1, Math.floor(perPage));
}
