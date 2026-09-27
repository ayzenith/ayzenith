/**
 * How many failed sign-ins are too many (pure — no clock, no database).
 *
 * The counting and storage live in `src/server/login-throttle.ts`; this file is
 * only the rule, kept separate so the limits, the window and the decision can
 * be tested exactly rather than approximately.
 *
 * Two keys, on purpose:
 *   • per EMAIL  — stops someone grinding one account's password.
 *   • per ADDRESS — stops someone grinding many accounts from one place.
 * The address rule is secondary and is skipped entirely when no trusted proxy
 * vouched for the address (see `client-ip.ts`), because enforcing it against a
 * forged address would lock out whoever the attacker named.
 *
 * KNOWN TRADEOFF, accepted deliberately: a per-email limit means a third party
 * who knows an address can spend its budget and keep the real owner out for the
 * window. That is inherent to per-account throttling, the window is short, and
 * the alternative — no per-account limit — is worse.
 */

export const WINDOW_MS = 15 * 60 * 1000;

/** Failed attempts allowed per email inside the window. */
export const MAX_PER_EMAIL = 5;

/** Failed attempts allowed per client address inside the window. */
export const MAX_PER_IP = 15;

export type ThrottleCounts = {
  /** Attempts already recorded for this email in the window, INCLUDING the
   *  one being decided — the caller records first, then asks. */
  email: number;
  /** Same for the address, or null when no address could be trusted. */
  ip: number | null;
};

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; scope: "email" | "ip"; retryAfterMs: number };

/**
 * `oldestMs` is the age of the oldest attempt still inside the window, used to
 * say when the block lifts. Null (nothing recorded yet) means a full window.
 */
export function decideThrottle(counts: ThrottleCounts, oldestAgeMs: number | null = null): ThrottleDecision {
  const retryAfterMs = Math.max(0, WINDOW_MS - (oldestAgeMs ?? 0));

  // Email first: it is the specific, strongest signal, and naming it makes the
  // log useful. The address rule is a backstop for spraying across accounts.
  if (counts.email > MAX_PER_EMAIL) return { allowed: false, scope: "email", retryAfterMs };
  if (counts.ip != null && counts.ip > MAX_PER_IP) return { allowed: false, scope: "ip", retryAfterMs };
  return { allowed: true };
}

/** "15 dakika", "3 dakika", "1 dakikadan az" — for the one message users see. */
export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) return "birazdan";
  if (minutes === 1) return "1 dakika";
  return `${minutes} dakika`;
}
