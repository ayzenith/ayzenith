import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { httpGetText, HttpStatusError } from "../leads/http";
import { extractWebProduct, type WebProduct } from "../import/webextract";
import type { ScanStatus } from "./types";

/**
 * PRODUCT INTELLIGENCE — reading ONE product page the operator pointed at.
 *
 * V1 DOES NOT CRAWL A MARKETPLACE. This is the single-URL path: a person hands
 * the system one address and it reads that address, once, politely, and records
 * what happened. Import Intelligence already does exactly this for supplier
 * pages, so the reading itself is `import/webextract.ts` unchanged.
 *
 * Three pieces are reused rather than rebuilt:
 *   • `leads/http.ts`      — the hardened client. Node's global fetch can be
 *                            made to assert OUTSIDE the promise chain by a
 *                            malformed response and take the process with it;
 *                            one real lead's site did that reproducibly.
 *   • `leads/blocking.ts`  — through that client: a refusal aimed at US is kept
 *                            apart from a page that is genuinely gone.
 *   • `RadarRawCache`      — the one shared raw cache, under its own provider
 *                            string. A second cache table was considered and
 *                            rejected: the column is a free string precisely so
 *                            tools can share it.
 *
 * Every outcome, including every failure, comes back as a scan-source record.
 * Nothing here may return "nothing found" without saying why.
 */

const PROVIDER = "product-intel";
const TTL_HOURS = 24;

export type PageRead = {
  url: string;
  finalUrl: string | null;
  product: WebProduct | null;
  status: ScanStatus;
  blockKind: string | null;
  httpStatus: number | null;
  fromCache: boolean;
  note: string | null;
};

/**
 * Refuse anything that is not a public http(s) address.
 *
 * The URL comes from a form, and a server that will fetch whatever it is told
 * can be pointed at the private network it is sitting in. This is the cheap,
 * boring guard that stops that: scheme allow-list plus the private ranges.
 */
export function checkFetchableUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Geçerli bir adres değil." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Yalnızca http ve https adresleri okunur." };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host)
  ) {
    return { ok: false, reason: "Yerel veya özel ağ adresleri okunamaz." };
  }
  return { ok: true, url };
}

function cacheKey(url: string): string {
  return createHash("sha256").update(`${PROVIDER}:page:${url}`).digest("hex");
}

export async function readProductPage(rawUrl: string): Promise<PageRead> {
  const check = checkFetchableUrl(rawUrl);
  if (!check.ok) {
    return { url: rawUrl, finalUrl: null, product: null, status: "ERROR", blockKind: null, httpStatus: null, fromCache: false, note: check.reason };
  }
  const url = check.url.toString();
  const key = cacheKey(url);

  // 1 — serve a fresh copy rather than asking the same site the same question.
  try {
    const row = await db.radarRawCache.findUnique({ where: { key } });
    if (row && row.expiresAt > new Date()) {
      const payload = row.payload as { html?: string } | null;
      const html = typeof payload?.html === "string" ? payload.html : null;
      if (html) {
        return {
          url,
          finalUrl: url,
          product: extractWebProduct(html),
          status: "OK",
          blockKind: null,
          httpStatus: 200,
          fromCache: true,
          note: `Önbellekten okundu (${row.fetchedAt.toISOString().slice(0, 10)}).`,
        };
      }
    }
  } catch {
    // A cache read failure must never stop the live read.
  }

  // 2 — ask once, honestly, through the hardened client.
  try {
    const res = await httpGetText(url, { timeoutMs: 15_000, maxBytes: 1_500_000 });
    if (res.blockKind) {
      return {
        url,
        finalUrl: res.finalUrl,
        product: null,
        status: res.blockKind === "RATE_LIMITED" ? "RATE_LIMITED" : "BLOCKED",
        blockKind: res.blockKind,
        httpStatus: res.status,
        fromCache: false,
        note: "Site otomatik istemcileri geri çevirdi. Sayfanın içeriğini elle yapıştırabilirsiniz.",
      };
    }
    const product = extractWebProduct(res.text);
    if (!product.title && product.text.trim() === "") {
      return { url, finalUrl: res.finalUrl, product: null, status: "EMPTY", blockKind: null, httpStatus: res.status, fromCache: false, note: "Sayfa okundu ama ürün metni bulunamadı." };
    }

    const now = new Date();
    try {
      await db.radarRawCache.upsert({
        where: { key },
        create: { key, provider: PROVIDER, query: { url }, payload: { html: res.text }, fetchedAt: now, expiresAt: new Date(now.getTime() + TTL_HOURS * 3600_000) },
        update: { payload: { html: res.text }, fetchedAt: now, expiresAt: new Date(now.getTime() + TTL_HOURS * 3600_000), query: { url } },
      });
    } catch {
      // Non-fatal: we already have the live page.
    }

    return {
      url,
      finalUrl: res.finalUrl,
      product,
      status: "OK",
      blockKind: null,
      httpStatus: res.status,
      fromCache: false,
      note: product.structured ? "Sayfa schema.org ürün verisi yayınlıyor." : null,
    };
  } catch (e) {
    if (e instanceof HttpStatusError) {
      return {
        url,
        finalUrl: null,
        product: null,
        status: e.blockKind ? (e.blockKind === "RATE_LIMITED" ? "RATE_LIMITED" : "BLOCKED") : "ERROR",
        blockKind: e.blockKind,
        httpStatus: e.status,
        fromCache: false,
        note: e.message,
      };
    }
    return { url, finalUrl: null, product: null, status: "ERROR", blockKind: null, httpStatus: null, fromCache: false, note: (e as Error).message };
  }
}

/** The cache key, so a stored offer can point at the exact raw response. */
export function pageCacheKey(url: string): string {
  return cacheKey(url);
}
