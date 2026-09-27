/**
 * Whose address is this, really? (pure — takes headers, touches nothing)
 *
 * WHY THIS IS CAREFUL RATHER THAN CONVENIENT
 *
 * `x-forwarded-for` is a header, and a header is whatever the client typed.
 * Reading the first entry — the usual one-liner — hands the client a free
 * choice of identity. That is bad for logging and *worse* for a rate limiter:
 * a limiter keyed on a spoofable address is a denial-of-service tool, because
 * an attacker can spend someone else's budget and lock them out.
 *
 * So the rule here is: an address is only returned when a TRUSTED proxy put it
 * there. When we cannot establish that, this returns null and the caller drops
 * the per-IP rule rather than inventing one. Losing a secondary control beats
 * enforcing it against the wrong person.
 *
 * Two trusted configurations:
 *   • Vercel — `x-vercel-forwarded-for` is set by Vercel's own edge and
 *     overwrites anything the client sent, so it is the one to read there.
 *   • Any other reverse proxy — opt in explicitly with TRUSTED_PROXY_HOPS=n,
 *     meaning "n proxies I control append to x-forwarded-for". The client's
 *     address is then the nth entry from the RIGHT, because everything further
 *     left was supplied before our own infrastructure touched it.
 *
 * With neither, there is no trusted source and the answer is null.
 */

export type ProxyTrust =
  | { kind: "vercel" }
  | { kind: "hops"; hops: number }
  | { kind: "none" };

/** What the running environment says about who is in front of us. */
export function proxyTrustFromEnv(env: Record<string, string | undefined>): ProxyTrust {
  const hops = Number(env.TRUSTED_PROXY_HOPS);
  if (Number.isInteger(hops) && hops > 0) return { kind: "hops", hops };
  if (env.VERCEL) return { kind: "vercel" };
  return { kind: "none" };
}

/** Anything that can answer `get(name)` — a real `Headers` or a plain map. */
export type HeaderLike = { get(name: string): string | null | undefined };

function firstAddress(value: string | null | undefined): string | null {
  const v = (value ?? "").split(",")[0]?.trim();
  return v ? normalizeIp(v) : null;
}

/** Strip a port and IPv6 brackets, lower-case, so one address is one key. */
export function normalizeIp(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  // "[::1]:1234" or "[::1]"
  const bracketed = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed && bracketed[1]) return bracketed[1];
  // "1.2.3.4:5678" — only strip the port when it is unambiguously IPv4:port.
  const ipv4Port = v.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4Port && ipv4Port[1]) v = ipv4Port[1];
  // A bare IPv6 keeps its colons; anything with no content is not an address.
  return v || null;
}

/**
 * The client address, or null when no trusted proxy vouched for it.
 * `trust` is passed in rather than read from the environment so the decision
 * is visible at the call site and testable without touching process.env.
 */
export function clientIpFrom(headers: HeaderLike, trust: ProxyTrust): string | null {
  if (trust.kind === "vercel") {
    // Vercel sets this itself; a client-supplied copy is overwritten.
    const vercel = firstAddress(headers.get("x-vercel-forwarded-for"));
    if (vercel) return vercel;
    // Fall back to the LAST entry of x-forwarded-for: on Vercel our own edge
    // appended it, so it is the one hop we know we control. The entries to its
    // left may be anything the caller wrote.
    const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const last = chain[chain.length - 1];
    return last ? normalizeIp(last) : null;
  }

  if (trust.kind === "hops") {
    const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // n trusted proxies appended n entries; the client is the one just before
    // them. Too short a chain means somebody skipped the proxy — not trusted.
    const idx = chain.length - trust.hops;
    if (idx < 0 || idx >= chain.length) return null;
    const value = chain[idx];
    return value ? normalizeIp(value) : null;
  }

  return null;
}
