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
 *
 * RATE LIMITING (2026-08-23 fix). A live measurement against the real endpoint
 * found it throttles hard: 14 requests spaced 1200ms apart drew 4× HTTP 429; the
 * SAME 14 spaced 2500ms apart drew zero. A single RADAR analysis fires far more
 * than 14 comtrade calls (peer basket × HS codes, several providers in
 * parallel), so it was hitting 429 constantly. The bug this caused was silent:
 * `fetchReporterWorld`/`fetchBilateralExport` in comtrade.ts catch every error
 * (network, HTTP, throttling) and return null — INDISTINGUISHABLE from Comtrade
 * genuinely having no rows for that query. A throttled peer country therefore
 * dropped out of the min–max comparison basket exactly like a country with zero
 * trade, silently changing the score. That is why identical same-day analyses
 * of the same market produced different scores (78 vs 84 for one real case).
 * Fix, scoped to this module so every radar provider benefits: (1) serialize
 * live network calls per provider with a floor gap between request STARTS
 * (measured-safe default 2200ms, comfortably above the 2500ms clean run), so
 * concurrent callers queue instead of bursting; (2) on HTTP 429, retry — honour
 * `Retry-After` when present, otherwise back off — up to `MAX_429_RETRIES`
 * times before finally throwing. This does not touch scoring, weights, or any
 * cached value that was already legitimately stored.
 */

const MIN_GAP_MS: Partial<Record<ProviderId, number>> = {
  comtrade: 2200,
};
const MAX_429_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 2500;

/** One promise chain per provider — every live fetch for that provider awaits
 *  the previous one before starting, so calls are serialized regardless of how
 *  many callers issued them concurrently (mapLimit, Promise.all, …). */
const providerQueues = new Map<ProviderId, Promise<void>>();
const lastStart = new Map<ProviderId, number>();

async function throttleGap(provider: ProviderId): Promise<void> {
  const gap = MIN_GAP_MS[provider];
  if (!gap) return;
  const prev = providerQueues.get(provider) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  providerQueues.set(provider, next);
  await prev;
  const last = lastStart.get(provider) ?? 0;
  const wait = gap - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStart.set(provider, Date.now());
  release();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

  // 2. Real fetch — paced per provider, with bounded retry on 429 so a busy
  //    endpoint never gets silently read as "no data" (see module doc above).
  let res: Response | null = null;
  let attempt = 0;
  for (;;) {
    await throttleGap(opts.provider);
    res = await fetch(opts.url, {
      headers: opts.headers,
      // Trade data changes at most daily; avoid Next's fetch memo/cache layer so
      // OUR cache is the single source of truth.
      cache: "no-store",
    });
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) break;
    const retryAfterHeader = Number(res.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : DEFAULT_RETRY_DELAY_MS * (attempt + 1);
    attempt++;
    await sleep(delayMs);
  }
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? `${opts.provider} HTTP 429 — ${MAX_429_RETRIES} yeniden deneme sonrası hâlâ sınırlandırılıyor (${opts.url})`
        : `${opts.provider} HTTP ${res.status} — ${opts.url}`,
    );
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
