import "server-only";

import { db } from "@/lib/db";
import type { ImportSourceStatus, Prisma } from "@prisma/client";
import { sha256Hex } from "./text";
import { extractWebProduct, looksLikeManufacturerDomain, type WebProduct } from "./webextract";
import type { SourceRef } from "./types";

/**
 * IMPORT INTELLIGENCE — the source store.
 *
 * One row per fetched VERSION of a document, keyed by (key, contentHash):
 *   - same bytes again → only `lastCheckedAt` moves, so a case from last month
 *     still points at the row its numbers came from;
 *   - different bytes → a new row, the old one loses `isCurrent`, and until the
 *     new version is actually parsed the old one keeps serving with its change
 *     recorded (status CHANGED) rather than silently disappearing;
 *   - unreachable → an UNREACHABLE row, never a gap filled with a guess.
 */

export const SOURCE_CATALOGUE = {
  TR_TGTC: {
    name: "İstatistik Pozisyonlarına Bölünmüş Türk Gümrük Tarife Cetveli (2026)",
    publisher: "T.C. Ticaret Bakanlığı — Gümrükler Genel Müdürlüğü",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ggm.ticaret.gov.tr/data/6954cea313b8762ee854542c/2026 TGTC.zip",
    page: "https://ggm.ticaret.gov.tr/duyurular/istatistik-pozisyonlarina-bolunmus-turk-gumruk-tarife-cetveli-karar-sayisi-10781-yayimlanmistir",
  },
  TR_IRK_II_LIST: {
    name: "İthalat Rejimi Kararı — II Sayılı Liste (Sanayi Ürünleri, 25–97. Fasıllar)",
    publisher: "T.C. Ticaret Bakanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/data/68d2951f13b876c2509a480b/rejim 2026.zip",
    page: "https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/1-ithalat-rejimi-kararikarar-sayisi3350karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir",
  },
  TR_IGV_EK1: {
    name: "İthalatta İlave Gümrük Vergisi Kararı (3351) — Ek-1 Tablosu",
    publisher: "T.C. Ticaret Bakanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/data/63bd486013b8763b44f9da6c/İGV.zip",
    page: "https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/2-ithalatta-ilave-gumruk-vergisi-uygulanmasina-iliskin-karar-karar-sayisi-3351-karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir",
  },
  TR_TRADE_DEFENCE_AD: {
    name: "Damping ve Sübvansiyon Önlemleri Listesi (Yürürlükteki Önlemler)",
    publisher: "T.C. Ticaret Bakanlığı — İthalat Genel Müdürlüğü",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/data/63b7dcba13b876aca40f299e/Yürürlükteki Önlemler 13.07.2026.xlsx",
    page: "https://ticaret.gov.tr/ithalat/ticaret-politikasi-savunma-araclari/damping-ve-subvansiyon",
  },
  TR_TRADE_DEFENCE_SG: {
    name: "Yürürlükteki Korunma Önlemleri Listesi",
    publisher: "T.C. Ticaret Bakanlığı — İthalat Genel Müdürlüğü",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/data/6a54a234269de18f8041eb12/Yürürlükteki Önlemler-Safeguard Measures in Force....xlsx",
    page: "https://ticaret.gov.tr/ithalat/ticaret-politikasi-savunma-araclari/korunma-onlemleri/yururlukteki-onlemler",
  },
  TR_UGD_GROUPS: {
    name: "İthalatta Denetimi Gerçekleştirilen Ürün Grupları (TAREKS / ÜGD tebliğleri)",
    publisher: "T.C. Ticaret Bakanlığı — Ürün Güvenliği ve Denetimi Genel Müdürlüğü",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/urun-guvenligi/ithalatta-urun-guvenligi-denetimleri/ithalatta-denetimi-gerceklestirilen-urun-gruplari",
    page: null,
  },
  TR_IMPORT_COMMUNIQUES: {
    name: "İthalat Tebliğleri (2026 Yılı)",
    publisher: "T.C. Ticaret Bakanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/3-ithalat-tebligleri-2026-yili",
    page: null,
  },
  TR_VAT_RATES: {
    name: "Güncel KDV Oranları (2007/13033 sayılı BKK, konsolide)",
    publisher: "T.C. Hazine ve Maliye Bakanlığı — Gelir İdaresi Başkanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv/yardim-kaynaklar/yararli-bilgiler/kdv-oranlari.pdf",
    page: "https://www.gib.gov.tr/",
  },
  WCO_HS2022_UN: {
    name: "HS 2022 (H6) sınıflandırma referans listesi",
    publisher: "UN Statistics Division — UN Comtrade",
    sourceType: "OFFICIAL_INTL",
    tier: 2,
    url: "https://comtradeapi.un.org/files/v1/app/reference/H6.json",
    page: null,
  },
  TR_TARA: {
    name: "TARA — Tarife Arama Motoru (elle sorgulama)",
    publisher: "T.C. Ticaret Bakanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://uygulama.gtb.gov.tr/Tara/",
    page: null,
  },
  TR_IRK_2026_ANNEX: {
    name: "İthalat Rejimi Kararı 2026 ekleri — ülke grupları (II sayılı liste sütun başlıkları, EK-1 GTS ülkeleri)",
    publisher: "T.C. Ticaret Bakanlığı",
    sourceType: "OFFICIAL_TR",
    tier: 1,
    url: "https://ticaret.gov.tr/data/68d2951f13b876c2509a480b/rejim 2026.zip",
    page: null,
  },
} as const;

export type SourceKey = keyof typeof SOURCE_CATALOGUE;

export type RecordSourceInput = {
  key: string;
  name: string;
  publisher?: string | null;
  sourceType: string;
  tier: number;
  url?: string | null;
  title?: string | null;
  status?: ImportSourceStatus;
  statusCode?: number | null;
  contentType?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  bytes?: Uint8Array | string | null;
  byteSize?: number | null;
  publicationDate?: Date | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  consolidatedAsOf?: Date | null;
  version?: string | null;
  extractionMethod?: string | null;
  error?: string | null;
  rawContent?: string | null;
  parsed?: Prisma.InputJsonValue;
};

export type RecordedSource = { id: string; contentHash: string | null; isNew: boolean; replacedVersion: boolean };

export async function recordSourceVersion(input: RecordSourceInput): Promise<RecordedSource> {
  const contentHash = input.bytes ? sha256Hex(input.bytes) : null;
  const now = new Date();
  const existing = contentHash
    ? await db.importSource.findUnique({ where: { key_contentHash: { key: input.key, contentHash } } })
    : null;

  const data = {
    name: input.name,
    publisher: input.publisher ?? null,
    sourceType: input.sourceType,
    tier: input.tier,
    url: input.url ?? null,
    title: input.title ?? null,
    status: input.status ?? "OK",
    statusCode: input.statusCode ?? null,
    contentType: input.contentType ?? null,
    etag: input.etag ?? null,
    lastModified: input.lastModified ?? null,
    byteSize: input.byteSize ?? (typeof input.bytes === "string" ? input.bytes.length : input.bytes?.byteLength ?? null),
    publicationDate: input.publicationDate ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
    consolidatedAsOf: input.consolidatedAsOf ?? null,
    version: input.version ?? null,
    extractionMethod: input.extractionMethod ?? null,
    error: input.error ?? null,
    rawContent: input.rawContent ?? null,
    ...(input.parsed !== undefined ? { parsed: input.parsed } : {}),
  };

  if (existing) {
    await db.importSource.update({ where: { id: existing.id }, data: { ...data, lastCheckedAt: now, isCurrent: true } });
    return { id: existing.id, contentHash, isNew: false, replacedVersion: false };
  }

  const priorCurrent = await db.importSource.findFirst({ where: { key: input.key, isCurrent: true }, select: { id: true } });
  const created = await db.importSource.create({
    data: { key: input.key, contentHash, fetchedAt: now, lastCheckedAt: now, isCurrent: true, ...data },
  });
  if (priorCurrent) await db.importSource.update({ where: { id: priorCurrent.id }, data: { isCurrent: false } });
  return { id: created.id, contentHash, isNew: true, replacedVersion: !!priorCurrent };
}

export type FetchedBytes = { ok: true; bytes: Uint8Array; status: number; contentType: string | null; etag: string | null; lastModified: string | null } | { ok: false; status: number; error: string };

/** Plain fetch with a timeout — these are government file servers, not hostile sites. */
export async function fetchBytes(url: string, timeoutMs = 90_000): Promise<FetchedBytes> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store", headers: { "user-agent": "AYZENITH-ImportIntelligence/1.0 (+https://www.ayzenith.com)" } });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      ok: true,
      bytes: buf,
      status: res.status,
      contentType: res.headers.get("content-type"),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

export async function getCurrentSource(key: string) {
  return db.importSource.findFirst({ where: { key, isCurrent: true }, orderBy: { fetchedAt: "desc" } });
}

export async function listCurrentSources() {
  return db.importSource.findMany({
    where: { isCurrent: true, NOT: { key: { startsWith: "WEB:" } } },
    orderBy: [{ tier: "asc" }, { key: "asc" }],
  });
}

export function toSourceRef(s: {
  id: string;
  key: string;
  name: string;
  publisher: string | null;
  tier: number;
  url: string | null;
  fetchedAt: Date | null;
  version: string | null;
  status: string;
  consolidatedAsOf: Date | null;
  error: string | null;
}): SourceRef {
  return {
    sourceId: s.id,
    key: s.key,
    name: s.name,
    publisher: s.publisher,
    tier: s.tier,
    url: s.url,
    fetchedAt: s.fetchedAt ? s.fetchedAt.toISOString() : null,
    version: s.version,
    status: s.status,
    consolidatedAsOf: s.consolidatedAsOf ? s.consolidatedAsOf.toISOString().slice(0, 10) : null,
    note: s.error,
  };
}

/**
 * Re-fetch every official source and compare the bytes with the version in use.
 * A change is RECORDED on the row in use (status CHANGED + the new hash in
 * `parsed.pendingHash`) rather than replacing it: the loaded rules still work,
 * and the UI can say the stored version is out of date.
 */
export async function checkSourceChanges(): Promise<Array<{ key: string; state: "SAME" | "CHANGED" | "UNREACHABLE"; note: string }>> {
  const out: Array<{ key: string; state: "SAME" | "CHANGED" | "UNREACHABLE"; note: string }> = [];
  for (const row of await listCurrentSources()) {
    if (!row.url || row.key === "TR_TARA") continue;
    const res = await fetchBytes(row.url, 60_000);
    if (!res.ok) {
      await db.importSource.update({ where: { id: row.id }, data: { lastCheckedAt: new Date(), error: `Son kontrol: ${res.error}` } });
      out.push({ key: row.key, state: "UNREACHABLE", note: res.error });
      continue;
    }
    const hash = sha256Hex(res.bytes);
    if (hash === row.contentHash) {
      await db.importSource.update({ where: { id: row.id }, data: { lastCheckedAt: new Date(), status: "OK", error: null } });
      out.push({ key: row.key, state: "SAME", note: "Bayt bazında aynı." });
      continue;
    }
    const parsed = (row.parsed ?? {}) as Record<string, unknown>;
    await db.importSource.update({
      where: { id: row.id },
      data: {
        lastCheckedAt: new Date(),
        status: "CHANGED",
        error: `Kaynak yayıncıda değişti (yeni sha256 ${hash.slice(0, 12)}…, ${res.lastModified ?? "tarih yok"}). Yüklü sürüm eski; yeniden içe aktarılmalı.`,
        parsed: { ...parsed, pendingHash: hash, pendingLastModified: res.lastModified, pendingSeenAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
    out.push({ key: row.key, state: "CHANGED", note: `Yeni içerik (sha256 ${hash.slice(0, 12)}…)` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product pages the user points at
// ---------------------------------------------------------------------------

const WEB_CACHE_DAYS = 30;

export type WebSourceResult = { sourceId: string | null; key: string; url: string; status: "OK" | "UNREACHABLE"; tier: number; product: WebProduct | null; fromCache: boolean; error: string | null };

export async function fetchProductPage(url: string, brandHint: string | null): Promise<WebSourceResult> {
  const key = `WEB:${url}`;
  const cached = await db.importSource.findFirst({ where: { key, isCurrent: true }, orderBy: { fetchedAt: "desc" } });
  const fresh = cached?.fetchedAt && Date.now() - cached.fetchedAt.getTime() < WEB_CACHE_DAYS * 86_400_000;
  if (cached && fresh && cached.status === "OK" && cached.rawContent) {
    return { sourceId: cached.id, key, url, status: "OK", tier: cached.tier, product: (cached.parsed as unknown as WebProduct) ?? null, fromCache: true, error: null };
  }

  const res = await fetchBytes(url, 20_000);
  const manufacturer = looksLikeManufacturerDomain(url, brandHint);
  const tier = manufacturer ? 3 : 4;
  const base = {
    key,
    name: `Ürün sayfası: ${new URL(url).hostname}`,
    publisher: new URL(url).hostname,
    sourceType: manufacturer ? "MANUFACTURER" : "THIRD_PARTY",
    tier,
    url,
    extractionMethod: "HTML → schema.org Product + görünür metin",
  };
  if (!res.ok) {
    const rec = await recordSourceVersion({ ...base, status: "UNREACHABLE", statusCode: res.status || null, error: res.error, bytes: `UNREACHABLE:${url}:${Date.now()}` });
    return { sourceId: rec.id, key, url, status: "UNREACHABLE", tier, product: null, fromCache: false, error: res.error };
  }
  const html = new TextDecoder("utf-8").decode(res.bytes);
  const product = extractWebProduct(html);
  const rec = await recordSourceVersion({
    ...base,
    status: "OK",
    statusCode: res.status,
    contentType: res.contentType,
    etag: res.etag,
    lastModified: res.lastModified,
    bytes: res.bytes,
    title: product.title,
    rawContent: product.text.slice(0, 20_000),
    parsed: product as unknown as Prisma.InputJsonValue,
  });
  return { sourceId: rec.id, key, url, status: "OK", tier, product, fromCache: false, error: null };
}
