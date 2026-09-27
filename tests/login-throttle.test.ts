/**
 * Failed sign-in throttling.
 *
 * The limiter stores its counters as ordinary ActivityLog rows, so the part
 * worth testing is not Prisma — it is the rule: does a sixth attempt get
 * refused, does a success clear the count, does the window actually expire,
 * and can ten simultaneous requests walk past a limit of five? That last one
 * is why the storage is an injectable interface: the in-memory store below
 * behaves like the real one and lets the test hold the clock still.
 *
 * Nothing here touches a database.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { clientIpFrom, normalizeIp, proxyTrustFromEnv } from "../src/lib/auth/client-ip";
import {
  decideThrottle,
  formatRetryAfter,
  MAX_PER_EMAIL,
  MAX_PER_IP,
  WINDOW_MS,
} from "../src/lib/auth/throttle-policy";
import {
  clearEmailAttempts,
  discardAttempt,
  normalizeEmail,
  registerAttempt,
  throttleContext,
  ThrottleUnavailableError,
  type ThrottleContext,
  type ThrottleStore,
} from "../src/server/login-throttle";

// AUTH_SECRET is only used to key the HMAC that hides the email in the log.
process.env.AUTH_SECRET ??= "test-secret-at-least-thirty-two-chars-long";

// ---------------------------------------------------------------------------
// An in-memory stand-in for the ActivityLog rows, with a clock the test owns.
// ---------------------------------------------------------------------------

function makeStore() {
  const rows: Array<{ id: string; action: string; entityId: string; at: Date }> = [];
  let clock = new Date("2026-09-27T12:00:00.000Z");
  let failRecord = false;
  let seq = 0;

  const store: ThrottleStore = {
    async record(input) {
      if (failRecord) throw new Error("db down");
      const ids: string[] = [];
      for (const r of input) {
        const id = `row-${(seq += 1)}`;
        rows.push({ id, action: r.action, entityId: r.entityId, at: new Date(clock) });
        ids.push(id);
      }
      return ids;
    },
    async discard(ids) {
      for (const id of ids) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    async lastResetAt(emailKey, since) {
      const hits = rows
        .filter((r) => r.action === "auth.throttle.reset" && r.entityId === emailKey && r.at >= since)
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      return hits[0]?.at ?? null;
    },
    async count(action, entityId, since) {
      return rows.filter((r) => r.action === action && r.entityId === entityId && r.at >= since).length;
    },
    async oldest(action, entityId, since) {
      const hits = rows
        .filter((r) => r.action === action && r.entityId === entityId && r.at >= since)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      return hits[0]?.at ?? null;
    },
  };

  return {
    store,
    rows,
    now: () => new Date(clock),
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    breakWrites(v = true) {
      failRecord = v;
    },
  };
}

const ctx = (over: Partial<ThrottleContext> = {}): ThrottleContext => ({
  emailKey: "email-key",
  ipKey: "ip-key",
  ipTrusted: true,
  ...over,
});

// ---------------------------------------------------------------------------
// 1. THE NORMAL FLOWS
// ---------------------------------------------------------------------------

test("throttle: the first attempt is allowed", async () => {
  const s = makeStore();
  const d = await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal(d.allowed, true);
});

test("throttle: attempts up to the email limit are allowed, the next one is not", async () => {
  const s = makeStore();
  for (let i = 1; i <= MAX_PER_EMAIL; i += 1) {
    const d = await registerAttempt(ctx(), { store: s.store, now: s.now });
    assert.equal(d.allowed, true, `attempt ${i} of ${MAX_PER_EMAIL} must be allowed`);
  }
  const blocked = await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.scope, "email");
});

test("throttle: a blocked attempt reports when it lifts", async () => {
  const s = makeStore();
  for (let i = 0; i <= MAX_PER_EMAIL; i += 1) await registerAttempt(ctx(), { store: s.store, now: s.now });
  s.advance(5 * 60_000);
  const d = await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal(d.allowed, false);
  if (!d.allowed) {
    // Ten minutes of the fifteen-minute window are left from the oldest attempt.
    assert.ok(d.retryAfterMs > 9 * 60_000 && d.retryAfterMs <= 10 * 60_000, `got ${d.retryAfterMs}ms`);
  }
});

// ---------------------------------------------------------------------------
// 2. RESET ON SUCCESS
// ---------------------------------------------------------------------------

test("throttle: a successful sign-in clears that email's count", async () => {
  const s = makeStore();
  for (let i = 0; i < MAX_PER_EMAIL; i += 1) await registerAttempt(ctx(), { store: s.store, now: s.now });

  s.advance(1000);
  await clearEmailAttempts(ctx(), s.store);
  s.advance(1000);

  for (let i = 1; i <= MAX_PER_EMAIL; i += 1) {
    const d = await registerAttempt(ctx(), { store: s.store, now: s.now });
    assert.equal(d.allowed, true, `attempt ${i} after the reset must be allowed again`);
  }
});

test("throttle: the reset does NOT clear the address count", async () => {
  // One person signing in correctly says nothing about the other accounts
  // being tried from the same place.
  const s = makeStore();
  for (let i = 0; i < MAX_PER_IP; i += 1) {
    await registerAttempt(ctx({ emailKey: `email-${i}` }), { store: s.store, now: s.now });
  }
  await clearEmailAttempts(ctx({ emailKey: "email-0" }), s.store);
  const d = await registerAttempt(ctx({ emailKey: "fresh-email" }), { store: s.store, now: s.now });
  assert.equal(d.allowed, false);
  if (!d.allowed) assert.equal(d.scope, "ip");
});

test("throttle: successful sign-ins do not spend the ADDRESS budget", async () => {
  // The policy counts FAILED attempts. The reservation is written before the
  // outcome is known, so a success has to take its own row back — otherwise an
  // office behind one shared address is locked out after fifteen *successful*
  // sign-ins, and the address counter is deliberately never reset.
  const s = makeStore();
  for (let i = 0; i < MAX_PER_IP + 5; i += 1) {
    const r = await registerAttempt(ctx({ emailKey: `person-${i % 3}` }), { store: s.store, now: s.now });
    assert.equal(r.allowed, true, `successful sign-in ${i + 1} must not be blocked`);
    // What loginAction does on success:
    await discardAttempt(r.attemptIds, s.store);
    await clearEmailAttempts(ctx({ emailKey: `person-${i % 3}` }), s.store);
  }
  assert.equal(s.rows.filter((r) => r.action === "auth.throttle.ip").length, 0, "no address rows should survive");
});

test("throttle: a failure keeps its row, a success does not", async () => {
  const s = makeStore();
  const failed = await registerAttempt(ctx(), { store: s.store, now: s.now });
  // failure: nothing is discarded
  const succeeded = await registerAttempt(ctx(), { store: s.store, now: s.now });
  await discardAttempt(succeeded.attemptIds, s.store);

  assert.equal(s.rows.filter((r) => r.action === "auth.throttle.email").length, 1);
  assert.ok(failed.attemptIds.length > 0);
});

test("throttle: a reset older than the window does not resurrect an old count", async () => {
  const s = makeStore();
  await clearEmailAttempts(ctx(), s.store);
  s.advance(WINDOW_MS + 1000);
  for (let i = 0; i <= MAX_PER_EMAIL; i += 1) await registerAttempt(ctx(), { store: s.store, now: s.now });
  const d = await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal(d.allowed, false, "the stale reset must not keep the count clear forever");
});

// ---------------------------------------------------------------------------
// 3. THE WINDOW EXPIRES
// ---------------------------------------------------------------------------

test("throttle: the block lifts once the window passes", async () => {
  const s = makeStore();
  for (let i = 0; i <= MAX_PER_EMAIL; i += 1) await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal((await registerAttempt(ctx(), { store: s.store, now: s.now })).allowed, false);

  s.advance(WINDOW_MS + 1000);
  const after = await registerAttempt(ctx(), { store: s.store, now: s.now });
  assert.equal(after.allowed, true, "attempts older than the window must stop counting");
});

test("throttle: attempts sliding out of the window free budget one at a time", async () => {
  const s = makeStore();
  // Five attempts a minute apart, filling the email budget.
  for (let i = 0; i < MAX_PER_EMAIL; i += 1) {
    await registerAttempt(ctx(), { store: s.store, now: s.now });
    s.advance(60_000);
  }
  // Jump to just after the FIRST attempt leaves the window; one slot frees up.
  s.advance(WINDOW_MS - MAX_PER_EMAIL * 60_000 + 1000);
  assert.equal((await registerAttempt(ctx(), { store: s.store, now: s.now })).allowed, true);
  assert.equal((await registerAttempt(ctx(), { store: s.store, now: s.now })).allowed, false, "only one slot freed");
});

// ---------------------------------------------------------------------------
// 4. CONCURRENCY — the reason the attempt is recorded before it is counted
// ---------------------------------------------------------------------------

test("throttle: simultaneous attempts can never exceed the limit", async () => {
  // THE security property: however the requests interleave, the number allowed
  // is never more than the budget. The naive order — count, decide, then
  // record — fails this: twenty requests all read zero and all proceed.
  const s = makeStore();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => registerAttempt(ctx(), { store: s.store, now: s.now })),
  );
  const allowed = results.filter((r) => r.allowed).length;
  assert.ok(allowed <= MAX_PER_EMAIL, `at most ${MAX_PER_EMAIL} may pass, ${allowed} did`);
});

test("throttle: a burst larger than the budget is refused outright", async () => {
  // Recording before counting means every request in a truly simultaneous
  // burst sees all of the others, so a burst of twenty is refused entirely
  // rather than letting five through. That is the conservative direction and
  // it is the intended behaviour: twenty at once is not a person typing.
  const s = makeStore();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => registerAttempt(ctx(), { store: s.store, now: s.now })),
  );
  assert.equal(results.filter((r) => r.allowed).length, 0);
});

test("throttle: a double-clicked login button is not punished", async () => {
  // The flip side of the rule above: a small burst stays inside the budget, so
  // an impatient user who submits twice is still allowed.
  const s = makeStore();
  const results = await Promise.all([
    registerAttempt(ctx(), { store: s.store, now: s.now }),
    registerAttempt(ctx(), { store: s.store, now: s.now }),
  ]);
  assert.equal(results.filter((r) => r.allowed).length, 2);
});

test("throttle: simultaneous attempts across many emails cannot exceed the address limit", async () => {
  const s = makeStore();
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) => registerAttempt(ctx({ emailKey: `e${i}` }), { store: s.store, now: s.now })),
  );
  const allowed = results.filter((r) => r.allowed).length;
  assert.ok(allowed <= MAX_PER_IP, `at most ${MAX_PER_IP} may pass on the address rule, ${allowed} did`);
});

test("throttle: sequential attempts give exactly the documented budget", async () => {
  // Real traffic is serialised by the network, and there the rule is exact:
  // five allowed, the sixth refused. The burst tests above cover the edge.
  const s = makeStore();
  let allowed = 0;
  for (let i = 0; i < 10; i += 1) {
    if ((await registerAttempt(ctx(), { store: s.store, now: s.now })).allowed) allowed += 1;
  }
  assert.equal(allowed, MAX_PER_EMAIL);
});

// ---------------------------------------------------------------------------
// 5. FAILING CLOSED
// ---------------------------------------------------------------------------

test("throttle: a counter that cannot be written refuses rather than waving through", async () => {
  const s = makeStore();
  s.breakWrites();
  await assert.rejects(
    () => registerAttempt(ctx(), { store: s.store, now: s.now }),
    (e: unknown) => e instanceof ThrottleUnavailableError,
  );
});

test("throttle: with no trusted address only the email rule applies", async () => {
  const s = makeStore();
  const noIp = ctx({ ipKey: null, ipTrusted: false });
  for (let i = 0; i < MAX_PER_EMAIL; i += 1) {
    assert.equal((await registerAttempt(noIp, { store: s.store, now: s.now })).allowed, true);
  }
  const d = await registerAttempt(noIp, { store: s.store, now: s.now });
  assert.equal(d.allowed, false);
  if (!d.allowed) assert.equal(d.scope, "email", "never blame an address we could not trust");
  assert.equal(s.rows.filter((r) => r.action === "auth.throttle.ip").length, 0, "no address rows written");
});

test("throttle: a missing or weak AUTH_SECRET is a controlled failure, not a crash", async () => {
  // The key is derived from AUTH_SECRET, so a misconfiguration has to surface
  // as the login form's own error. `throttleContext` is therefore called
  // INSIDE loginAction's try block — the assertion below is what makes that
  // placement load-bearing rather than incidental.
  const saved = process.env.AUTH_SECRET;
  const headers = { get: () => null };
  try {
    delete process.env.AUTH_SECRET;
    assert.throws(() => throttleContext("a@b.com", headers), /AUTH_SECRET/);

    process.env.AUTH_SECRET = "too-short";
    assert.throws(() => throttleContext("a@b.com", headers), /AUTH_SECRET/);

    process.env.AUTH_SECRET = "a-perfectly-adequate-secret-of-32+-chars";
    const ctxOk = throttleContext("a@b.com", headers);
    assert.ok(ctxOk.emailKey.length > 0);
  } finally {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  }
});

test("throttle: the key is an HMAC, so no address is readable in the log", () => {
  const headers = { get: () => null };
  const a = throttleContext("ayaz@ayzenith.com", headers);
  const b = throttleContext("AYAZ@AYZENITH.COM ", headers);
  const c = throttleContext("someone.else@ayzenith.com", headers);

  assert.equal(a.emailKey, b.emailKey, "one address is one key whatever the casing");
  assert.notEqual(a.emailKey, c.emailKey);
  assert.ok(!a.emailKey.includes("ayaz"), "the plaintext must not survive into the log");
  assert.ok(!a.emailKey.includes("@"));
  assert.match(a.emailKey, /^[0-9a-f]+$/);
});

// ---------------------------------------------------------------------------
// 6. THE LOGIN FLOW ITSELF — the behaviour that must NOT have changed
// ---------------------------------------------------------------------------

test("login: the generic failure message is unchanged and still the only one", () => {
  const src = readFileSync(new URL("../src/app/(admin)/admin/login/actions.ts", import.meta.url), "utf8");

  // Byte-for-byte the message that shipped before throttling existed.
  assert.ok(
    src.includes('return { error: "E-posta veya şifre hatalı ya da hesabınız devre dışı." };'),
    "the generic credentials error must be untouched",
  );
  // A wrong password and an unknown address must not take different branches.
  assert.equal(
    (src.match(/E-posta veya şifre hatalı/g) ?? []).length,
    1,
    "exactly one credentials-failure message, or the wording could diverge",
  );
});

test("login: the throttle runs BEFORE authenticate, so an unknown email behaves identically", () => {
  const src = readFileSync(new URL("../src/app/(admin)/admin/login/actions.ts", import.meta.url), "utf8");
  const throttleAt = src.indexOf("registerAttempt(ctx)");
  const authAt = src.indexOf("await authenticate(");
  assert.ok(throttleAt > 0 && authAt > 0);
  assert.ok(
    throttleAt < authAt,
    "throttling after authenticate would both waste the bcrypt work and let a blocked attempt succeed",
  );
});

test("login: the context is derived inside the guarded block", () => {
  const src = readFileSync(new URL("../src/app/(admin)/admin/login/actions.ts", import.meta.url), "utf8");
  const tryAt = src.indexOf("try {", src.indexOf("let ctx;"));
  const ctxAt = src.indexOf("throttleContext(parsed.data.email");
  assert.ok(tryAt > 0 && ctxAt > tryAt, "throttleContext can throw on a bad AUTH_SECRET; it must be inside the try");
});

test("login: a successful sign-in withdraws its reservation and clears the email count", () => {
  const src = readFileSync(new URL("../src/app/(admin)/admin/login/actions.ts", import.meta.url), "utf8");
  const discardAt = src.indexOf("discardAttempt(decision.attemptIds)");
  const clearAt = src.indexOf("clearEmailAttempts(ctx)");
  const authAt = src.indexOf("await authenticate(");
  assert.ok(discardAt > authAt, "the reservation may only be withdrawn once the sign-in actually worked");
  assert.ok(clearAt > authAt);
});

// ---------------------------------------------------------------------------
// 7. THE POLICY ITSELF
// ---------------------------------------------------------------------------

test("policy: the documented limits are 5 per email and 15 per address in 15 minutes", () => {
  assert.equal(MAX_PER_EMAIL, 5);
  assert.equal(MAX_PER_IP, 15);
  assert.equal(WINDOW_MS, 15 * 60 * 1000);
});

test("policy: email is blamed before address when both are over", () => {
  const d = decideThrottle({ email: 99, ip: 99 });
  assert.equal(d.allowed, false);
  if (!d.allowed) assert.equal(d.scope, "email");
});

test("policy: a null address count is simply not enforced", () => {
  assert.equal(decideThrottle({ email: MAX_PER_EMAIL, ip: null }).allowed, true);
});

test("policy: the retry message is human", () => {
  assert.equal(formatRetryAfter(15 * 60_000), "15 dakika");
  assert.equal(formatRetryAfter(30_000), "1 dakika");
  assert.equal(formatRetryAfter(0), "birazdan");
});

// ---------------------------------------------------------------------------
// 7. IDENTITY — normalisation and whose address we are willing to believe
// ---------------------------------------------------------------------------

test("identity: one email address is one key", () => {
  assert.equal(normalizeEmail("  Ayaz@AYZENITH.com "), "ayaz@ayzenith.com");
  assert.equal(normalizeEmail("AYAZ@ayzenith.COM"), normalizeEmail("ayaz@ayzenith.com"));
});

test("identity: a forged x-forwarded-for is not an address", () => {
  const headers = { get: (n: string) => (n === "x-forwarded-for" ? "1.2.3.4" : null) };
  // No trusted proxy configured — the header is just something the client said.
  assert.equal(clientIpFrom(headers, { kind: "none" }), null);
});

test("identity: on Vercel the platform's own header wins over the client's", () => {
  const headers = {
    get: (n: string) =>
      n === "x-vercel-forwarded-for" ? "203.0.113.7" : n === "x-forwarded-for" ? "9.9.9.9, 203.0.113.7" : null,
  };
  assert.equal(clientIpFrom(headers, { kind: "vercel" }), "203.0.113.7");
});

test("identity: with a client-supplied chain, the trusted hop is taken from the right", () => {
  // "evil, evil, real" — one proxy we control appended the real address last.
  const headers = { get: (n: string) => (n === "x-forwarded-for" ? "1.1.1.1, 2.2.2.2, 203.0.113.7" : null) };
  assert.equal(clientIpFrom(headers, { kind: "hops", hops: 1 }), "203.0.113.7");
  // A chain shorter than the configured hops means the proxy was bypassed.
  const short = { get: (n: string) => (n === "x-forwarded-for" ? "1.1.1.1" : null) };
  assert.equal(clientIpFrom(short, { kind: "hops", hops: 2 }), null);
});

test("identity: ports and brackets do not create two keys for one address", () => {
  assert.equal(normalizeIp("1.2.3.4:5678"), "1.2.3.4");
  assert.equal(normalizeIp("[2606:4700::1111]:443"), "2606:4700::1111");
  assert.equal(normalizeIp("  203.0.113.7 "), "203.0.113.7");
});

test("identity: trust comes from configuration, never from a header", () => {
  assert.deepEqual(proxyTrustFromEnv({}), { kind: "none" });
  assert.deepEqual(proxyTrustFromEnv({ VERCEL: "1" }), { kind: "vercel" });
  assert.deepEqual(proxyTrustFromEnv({ TRUSTED_PROXY_HOPS: "2" }), { kind: "hops", hops: 2 });
  assert.deepEqual(proxyTrustFromEnv({ TRUSTED_PROXY_HOPS: "0" }), { kind: "none" });
  assert.deepEqual(proxyTrustFromEnv({ TRUSTED_PROXY_HOPS: "nonsense" }), { kind: "none" });
});
