import "server-only";

import { createHmac } from "node:crypto";

import { db } from "@/lib/db";
import { clientIpFrom, proxyTrustFromEnv, type HeaderLike } from "@/lib/auth/client-ip";
import { decideThrottle, WINDOW_MS, type ThrottleDecision } from "@/lib/auth/throttle-policy";

/**
 * Failed sign-in throttling, stored in the existing `ActivityLog` table.
 *
 * NO MIGRATION. The counters are ordinary ActivityLog rows under their own
 * `action` keys, which is why they carry no new columns: the identity being
 * counted goes in `entityId`, and the `createdAt` index — the one this table
 * already has — is what makes "how many in the last fifteen minutes" cheap.
 *
 * THE IDENTITY IS HASHED, NOT STORED. A failed sign-in is often a real
 * person's address typed with the wrong password, or an attacker's guess at
 * who works here. Either way the plaintext has no business sitting in a log
 * forever, so `entityId` holds an HMAC keyed with AUTH_SECRET. It still counts
 * exactly; it just cannot be read back or looked up in a rainbow table.
 *
 * TWO DESIGN POINTS WORTH THE WORDS:
 *
 * 1. RECORD FIRST, THEN COUNT. The obvious order — count, decide, then record
 *    the failure — loses races: five simultaneous requests all read four and
 *    all proceed. Writing the attempt BEFORE deciding means every in-flight
 *    request is already in the number every other one sees, so concurrency can
 *    no longer walk past the limit. It costs one row per attempt, which is the
 *    point: the row is the reservation.
 *
 *    A consequence worth stating, because it is a real behaviour and not an
 *    accident: in a TRULY simultaneous burst larger than the budget, every
 *    request sees the whole burst and all of them are refused — twenty at once
 *    do not get five through. That is the conservative direction, and twenty
 *    at once is not a person typing. Serialised traffic, which is what real
 *    sign-ins are, gets the exact budget: five allowed, the sixth refused.
 *
 * 2. IT FAILS CLOSED. If the counter cannot be written, the sign-in is
 *    refused rather than waved through — otherwise a database wobble silently
 *    turns the limiter off, which is precisely when it matters. This costs
 *    nothing in practice: `authenticate()` reads the user from the same
 *    database, so a login could not have succeeded anyway.
 *
 * Deliberately NOT using `logActivity`: that helper swallows write failures by
 * design (auditing must never break the thing it records). Swallowing here
 * would disable the limiter without a sound.
 */

const ATTEMPT_EMAIL = "auth.throttle.email";
const ATTEMPT_IP = "auth.throttle.ip";
const RESET = "auth.throttle.reset";
const ENTITY = "LoginThrottle";

/** Rows older than this can no longer affect a decision, so they are pruned. */
const KEEP_MS = WINDOW_MS * 2;

export class ThrottleUnavailableError extends Error {
  constructor() {
    super("Giriş sayacı yazılamadı.");
    this.name = "ThrottleUnavailableError";
  }
}

function key(kind: "email" | "ip", value: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is missing or too short.");
  return createHmac("sha256", secret).update(`login-throttle:${kind}:${value}`).digest("hex").slice(0, 40);
}

/** One address is one key: trim, lower-case, and treat Unicode forms alike. */
export function normalizeEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export type ThrottleContext = {
  emailKey: string;
  ipKey: string | null;
  /** The address itself is never stored — kept only for the in-request log. */
  ipTrusted: boolean;
};

/**
 * The four things the limiter needs from storage.
 *
 * Named as an interface so the window, the reset and — the one that matters —
 * the concurrency behaviour can be tested against an in-memory store with a
 * clock the test controls. Testing those through Prisma would mean either a
 * live database or a mock of Prisma itself, and neither would prove the thing
 * worth proving: that ten simultaneous attempts cannot walk past a limit of
 * five. The Prisma implementation below is the default and the only one used
 * in the application.
 */
export type ThrottleStore = {
  /** Writes the rows and returns their ids, so a success can take them back. */
  record(rows: Array<{ action: string; entityId: string }>): Promise<string[]>;
  discard(ids: string[]): Promise<void>;
  lastResetAt(emailKey: string, since: Date): Promise<Date | null>;
  count(action: string, entityId: string, since: Date): Promise<number>;
  oldest(action: string, entityId: string, since: Date): Promise<Date | null>;
};

export const prismaThrottleStore: ThrottleStore = {
  async record(rows) {
    // One `create` per row rather than `createMany`, because the ids are what
    // let a successful sign-in withdraw its own reservation (see `discard`).
    const created = await Promise.all(
      rows.map((r) =>
        db.activityLog.create({
          data: { action: r.action, entity: ENTITY, entityId: r.entityId, summary: null, userId: null },
          select: { id: true },
        }),
      ),
    );
    return created.map((c) => c.id);
  },
  async discard(ids) {
    if (ids.length === 0) return;
    await db.activityLog.deleteMany({ where: { id: { in: ids }, entity: ENTITY } });
  },
  async lastResetAt(emailKey, since) {
    const row = await db.activityLog.findFirst({
      where: { action: RESET, entityId: emailKey, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  },
  async count(action, entityId, since) {
    return db.activityLog.count({ where: { action, entityId, createdAt: { gte: since } } });
  },
  async oldest(action, entityId, since) {
    const row = await db.activityLog.findFirst({
      where: { action, entityId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  },
};

export function throttleContext(email: string, headers: HeaderLike): ThrottleContext {
  const ip = clientIpFrom(headers, proxyTrustFromEnv(process.env));
  return {
    emailKey: key("email", normalizeEmail(email)),
    ipKey: ip ? key("ip", ip) : null,
    ipTrusted: ip != null,
  };
}

/**
 * Record this attempt, then decide whether it may proceed.
 *
 * Returns the decision for the attempt that was just recorded — so the caller
 * must not authenticate when `allowed` is false, and the recorded row keeps
 * counting for the rest of the window either way.
 */
export type AttemptResult = ThrottleDecision & {
  /** The reservation rows this attempt wrote. A sign-in that SUCCEEDS hands
   *  these to `discardAttempt`, so the counters end up counting failures —
   *  which is what the policy says — without giving up the reservation that
   *  makes the decision race-free while the attempt is in flight. */
  attemptIds: string[];
};

export async function registerAttempt(
  ctx: ThrottleContext,
  opts: { store?: ThrottleStore; now?: () => Date } = {},
): Promise<AttemptResult> {
  const store = opts.store ?? prismaThrottleStore;
  const now = opts.now ? opts.now() : new Date();
  const since = new Date(now.getTime() - WINDOW_MS);

  // 1 — the reservation. Fails closed (see the header comment).
  let attemptIds: string[];
  try {
    attemptIds = await store.record([
      { action: ATTEMPT_EMAIL, entityId: ctx.emailKey },
      ...(ctx.ipKey ? [{ action: ATTEMPT_IP, entityId: ctx.ipKey }] : []),
    ]);
  } catch {
    throw new ThrottleUnavailableError();
  }

  // 2 — a successful sign-in inside the window clears that email's count. The
  //     rows are not deleted (this is an audit table): counting simply starts
  //     from the newest reset marker.
  const lastReset = await store.lastResetAt(ctx.emailKey, since);
  const emailSince = lastReset && lastReset > since ? lastReset : since;

  const [emailCount, ipCount, oldest] = await Promise.all([
    store.count(ATTEMPT_EMAIL, ctx.emailKey, emailSince),
    ctx.ipKey ? store.count(ATTEMPT_IP, ctx.ipKey, since) : Promise.resolve(null),
    store.oldest(ATTEMPT_EMAIL, ctx.emailKey, emailSince),
  ]);

  const oldestAgeMs = oldest ? now.getTime() - oldest.getTime() : null;
  return { ...decideThrottle({ email: emailCount, ip: ipCount }, oldestAgeMs), attemptIds };
}

/**
 * A sign-in succeeded: take back the reservation this attempt wrote.
 *
 * Without this the counters would count ATTEMPTS rather than failures, and the
 * address rule — which is never reset, on purpose — would lock out an office
 * after fifteen *successful* sign-ins from one shared address. The rows are
 * only ever the two this request just created; the real audit entry
 * (`user.login`) is written separately and is never touched.
 */
export async function discardAttempt(ids: string[], store: ThrottleStore = prismaThrottleStore): Promise<void> {
  try {
    await store.discard(ids);
  } catch {
    // Leaving the rows behind only spends a little budget; it never grants
    // access, so this one may be quiet.
  }
}

/**
 * A sign-in succeeded: stop counting this email's attempts from here.
 *
 * Marker-based rather than a delete, so the attempt history stays intact. The
 * IP counter is deliberately NOT reset — one person signing in correctly says
 * nothing about the other accounts being tried from the same address.
 */
export async function clearEmailAttempts(ctx: ThrottleContext, store: ThrottleStore = prismaThrottleStore): Promise<void> {
  try {
    await store.record([{ action: RESET, entityId: ctx.emailKey }]);
  } catch {
    // A missed reset only means the user keeps a stale count for a few minutes.
    // It never grants access, so unlike the reservation this one may be quiet.
  }
}

/**
 * Drop throttle rows that can no longer influence a decision.
 *
 * Only the three bookkeeping actions above are touched — real audit entries
 * such as `user.login` are never deleted. Called opportunistically after a
 * sign-in attempt so the table does not grow forever without a scheduled job,
 * and failures are ignored because pruning is housekeeping, not security.
 */
export async function pruneThrottleRows(): Promise<void> {
  try {
    await db.activityLog.deleteMany({
      where: {
        action: { in: [ATTEMPT_EMAIL, ATTEMPT_IP, RESET] },
        entity: ENTITY,
        createdAt: { lt: new Date(Date.now() - KEEP_MS) },
      },
    });
  } catch {
    // Housekeeping only.
  }
}

export const THROTTLE_ACTIONS = { ATTEMPT_EMAIL, ATTEMPT_IP, RESET, ENTITY } as const;
