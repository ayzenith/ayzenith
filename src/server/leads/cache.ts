import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { httpGetText } from "./http";
import type { LeadProviderId } from "./providers/types";

/**
 * AYZENITH LEAD FINDER — raw response cache.
 *
 * Deliberately reuses RADAR's `RadarRawCache` table (§22): the `provider` column
 * is a free string, so Lead Finder's free sources ("overpass" / "nominatim" /
 * "website") coexist with RADAR's trade providers without a schema change. This
 * is the first concrete step of the shared "AYZENITH data engine": one raw cache,
 * two tools. It is the ONLY place Lead Finder talks to the network, so identical
 * public queries are never re-fetched while fresh (respecting free-source rate
 * limits and the "don't be an aggressive scraper" rule, §31).
 *
 * Failures are never swallowed into fake data — a network/HTTP error throws and
 * the caller records it as an explicit provider error.
 */

const DEFAULT_TTL_DAYS = 30;

function cacheKey(provider: LeadProviderId, query: unknown): string {
  const normalized = JSON.stringify(query, Object.keys(query as object).sort());
  return createHash("sha256").update(`lead:${provider}:${normalized}`).digest("hex");
}

export type LeadFetchOptions = {
  provider: LeadProviderId;
  /** Normalised query object — also the cache key and stored for audit. */
  query: Record<string, string | number>;
  url: string;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  ttlDays?: number;
  /** Parse the raw text; defaults to JSON.parse. Pass a text passthrough for HTML. */
  parse?: (text: string) => unknown;
  /** Abort the request after this many ms (free endpoints can hang). */
  timeoutMs?: number;
  /** Fetch through the hardened node:https client instead of global fetch.
   *  Set for arbitrary third-party WEBSITES: a malformed response makes undici
   *  assert outside the promise chain and take the whole process down, which one
   *  real lead's site did reproducibly. Our own known API endpoints (Overpass)
   *  stay on fetch. See http.ts (§V3.4). */
  safeHttp?: boolean;
  /** Reject a parsed payload as a soft failure WITHOUT caching it — e.g. an
   *  Overpass server-side timeout returns HTTP 200 with an empty body + a
   *  `remark`, which must never be cached or read as a real "empty" result. */
  validate?: (payload: unknown) => boolean;
  /** Return false to serve the payload but NOT persist it. Used to avoid caching
   *  empty OSM results: a transient empty (0 elements, no remark) would otherwise
   *  poison the cache for 30 days and make every later search return 0. */
  shouldCache?: (payload: unknown) => boolean;
};

export type LeadFetchResult = {
  payload: unknown;
  fetchedAt: Date;
  fromCache: boolean;
};

export async function cachedLeadFetch(opts: LeadFetchOptions): Promise<LeadFetchResult> {
  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  const key = cacheKey(opts.provider, opts.query);

  // 1. Serve fresh cache if present. HTML payloads were stored wrapped as
  //    `{ html }` so the Json column stays valid — unwrap them on the way out so
  //    callers always see exactly what a live fetch would have returned.
  try {
    const row = await db.radarRawCache.findUnique({ where: { key } });
    if (row && row.expiresAt > new Date()) {
      const p = row.payload as unknown;
      const unwrapped =
        p && typeof p === "object" && "html" in (p as Record<string, unknown>)
          ? (p as { html: unknown }).html
          : p;
      return { payload: unwrapped, fetchedAt: row.fetchedAt, fromCache: true };
    }
  } catch {
    // Cache read problems must not block a live fetch — fall through.
  }

  // 2. Real fetch (with a timeout; free endpoints occasionally stall).
  let text: string;
  if (opts.safeHttp) {
    // Third-party websites go through the hardened node:https client: some real
    // servers answer with malformed framing, and undici reacts to that with an
    // AssertionError thrown outside the promise chain, which no try/catch here
    // can stop — it kills the process. See http.ts (§V3.4).
    const res = await httpGetText(opts.url, { timeoutMs: opts.timeoutMs ?? 25_000, headers: opts.headers });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${opts.provider} HTTP ${res.status} — ${opts.url}`);
    }
    text = res.text;
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
    try {
      const res = await fetch(opts.url, {
        method: opts.method ?? "GET",
        headers: {
          // A descriptive UA is required by OSM/Nominatim usage policy.
          "user-agent": "AYZENITH-LeadFinder/1.0 (+https://www.ayzenith.com)",
          ...opts.headers,
        },
        body: opts.body,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`${opts.provider} HTTP ${res.status} — ${opts.url}`);
      }
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  const payload = (opts.parse ?? JSON.parse)(text);

  // Soft-failure gate: a payload the caller deems invalid (e.g. an Overpass
  // timeout remark) is NOT cached and is surfaced as an error so the caller can
  // retry — never silently stored as a real (empty) result.
  if (opts.validate && !opts.validate(payload)) {
    throw new Error(`${opts.provider}: geçersiz/eksik yanıt (kaynak zaman aşımı olabilir)`);
  }

  // 3. Persist verbatim (best-effort; store payload as JSON. For HTML we wrap the
  //    string so the Json column always holds valid JSON). A caller can opt OUT
  //    of caching a particular payload (e.g. an empty OSM result) so a transient
  //    empty never poisons the cache.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const stored = typeof payload === "string" ? { html: payload } : payload;
  const persist = opts.shouldCache ? opts.shouldCache(payload) : true;
  if (persist) try {
    await db.radarRawCache.upsert({
      where: { key },
      create: {
        key,
        provider: opts.provider,
        query: opts.query,
        payload: stored as object,
        fetchedAt: now,
        expiresAt,
      },
      update: { payload: stored as object, fetchedAt: now, expiresAt, query: opts.query },
    });
  } catch {
    // A cache-write failure is non-fatal: we still return the live payload.
  }

  // Return the parsed payload as the caller expects (unwrap the HTML envelope).
  const out =
    typeof payload === "string"
      ? payload
      : (payload as unknown);
  return { payload: out, fetchedAt: now, fromCache: false };
}
