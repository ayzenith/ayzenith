import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { DEFAULT_CACHE_TTL_DAYS } from "@/config/radar";
import type { ProviderId } from "./providers/types";

/**
 * AYZENITH RADAR — raw response cache.
 *
 * Comtrade's free tier is rate-limited (500 calls/day), so identical queries
 * must never hit the network twice while fresh. This module is the ONLY place
 * that talks to the network for trade data: `cachedFetch` returns a cached
 * payload when one exists and is unexpired, otherwise it performs the real fetch
 * and stores the raw response verbatim (so citations always point back to
 * exactly what was retrieved).
 *
 * Failures are never swallowed into fake data — a network/HTTP error throws, and
 * the caller records it as an explicit provider error.
 */

function cacheKey(provider: ProviderId, query: unknown): string {
  const normalized = JSON.stringify(query, Object.keys(query as object).sort());
  return createHash("sha256").update(`${provider}:${normalized}`).digest("hex");
}

export type CachedFetchOptions = {
  provider: ProviderId;
  /** Normalized query object — also used as the cache key and stored for audit. */
  query: Record<string, string | number>;
  url: string;
  /** Optional request headers (e.g. Comtrade key when configured later). */
  headers?: Record<string, string>;
  ttlDays?: number;
  /** Parse the raw text; defaults to JSON.parse. */
  parse?: (text: string) => unknown;
};

export type CachedFetchResult = {
  payload: unknown;
  fetchedAt: Date;
  fromCache: boolean;
};

/**
 * Fetch a URL through the persistent cache. Returns the parsed payload plus when
 * it was originally fetched. Throws on network failure or non-2xx HTTP so the
 * caller can surface an explicit error rather than continue with nothing.
 */
export async function cachedFetch(
  opts: CachedFetchOptions,
): Promise<CachedFetchResult> {
  const ttlDays = opts.ttlDays ?? DEFAULT_CACHE_TTL_DAYS;
  const key = cacheKey(opts.provider, opts.query);

  // 1. Serve fresh cache if present.
  try {
    const row = await db.radarRawCache.findUnique({ where: { key } });
    if (row && row.expiresAt > new Date()) {
      return { payload: row.payload, fetchedAt: row.fetchedAt, fromCache: true };
    }
  } catch {
    // Cache read problems must not block a live fetch — fall through.
  }

  // 2. Real fetch.
  const res = await fetch(opts.url, {
    headers: opts.headers,
    // Trade data changes at most daily; avoid Next's fetch memo/cache layer so
    // OUR cache is the single source of truth.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${opts.provider} HTTP ${res.status} — ${opts.url}`);
  }
  const text = await res.text();
  const payload = (opts.parse ?? JSON.parse)(text);

  // 3. Persist verbatim.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  try {
    await db.radarRawCache.upsert({
      where: { key },
      create: {
        key,
        provider: opts.provider,
        query: opts.query,
        payload: payload as object,
        fetchedAt: now,
        expiresAt,
      },
      update: { payload: payload as object, fetchedAt: now, expiresAt, query: opts.query },
    });
  } catch {
    // A cache-write failure is non-fatal: we still return the live payload.
  }

  return { payload, fetchedAt: now, fromCache: false };
}
