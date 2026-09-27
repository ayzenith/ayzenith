import "server-only";

import { db } from "@/lib/db";
import { pageSkip } from "@/lib/paging";
import type { ProductAttributes } from "../import/attributes";
import type { AnalysisStatus, PiEvidence, ScanStatus } from "./types";
import type { GapFinding } from "./gap";
import type { MarketProfile } from "./market";
import type { PriceStrategy } from "./price";
import type { Swot, LaunchSkeleton } from "./swot";
import type { TitleCandidate } from "./title";
import type { ScanScope } from "./analyze";

/**
 * PRODUCT INTELLIGENCE — the repository boundary.
 *
 * A stored analysis is FROZEN, so everything here reads and nothing updates.
 * The Json columns are cast back to the types the analysis wrote; they are our
 * own output from one transaction ago, not third-party input, which is why a
 * cast is honest here and would not be on anything arriving from outside.
 */

export type AnalysisListRow = {
  id: string;
  code: string;
  productName: string;
  marketplace: string;
  marketCountry: string;
  status: AnalysisStatus;
  dataConfidence: number;
  offerCount: number;
  createdAt: Date;
};

export async function listAnalyses(params: {
  page: number;
  perPage: number;
  marketplace?: string | null;
  status?: string | null;
  q?: string | null;
}): Promise<{ rows: AnalysisListRow[]; total: number }> {
  const where = {
    ...(params.marketplace ? { marketplace: params.marketplace } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q ? { productName: { contains: params.q, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.productAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // Clamped here, not trusted from the screen: an unbounded `?page=` turns
      // into a skip Postgres cannot hold and the list 500s instead of showing
      // page one. Every other repository in the module does the same.
      skip: pageSkip(params.page, params.perPage),
      take: params.perPage,
      select: {
        id: true,
        code: true,
        productName: true,
        marketplace: true,
        marketCountry: true,
        status: true,
        dataConfidence: true,
        createdAt: true,
        _count: { select: { offers: true } },
      },
    }),
    db.productAnalysis.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      productName: r.productName,
      marketplace: r.marketplace,
      marketCountry: r.marketCountry,
      status: r.status as AnalysisStatus,
      dataConfidence: r.dataConfidence,
      offerCount: r._count.offers,
      createdAt: r.createdAt,
    })),
    total,
  };
}

export type StoredOffer = {
  id: string;
  rank: number;
  title: string;
  brand: string | null;
  sellerName: string | null;
  price: number | null;
  currency: string;
  ratingAvg: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  provenance: string;
  rawExcerpt: string;
};

export type StoredScan = {
  id: string;
  marketplace: string;
  queryText: string | null;
  url: string | null;
  status: ScanStatus;
  blockKind: string | null;
  httpStatus: number | null;
  itemsFound: number;
  note: string | null;
  fetchedAt: Date;
  fromCache: boolean;
};

export type StoredAnalysis = {
  id: string;
  code: string;
  productName: string;
  marketplace: string;
  marketCountry: string;
  status: AnalysisStatus;
  dataConfidence: number;
  createdAt: Date;
  aiSummary: string | null;
  aiDisabledNote: string | null;

  itemId: string | null;
  itemName: string | null;
  itemSku: string | null;
  importCaseId: string | null;
  importCaseCode: string | null;
  channelId: string | null;
  channelName: string | null;

  attributes: ProductAttributes;
  scanScope: ScanScope;
  market: MarketProfile;
  gapFindings: GapFinding[];
  titles: TitleCandidate[];
  price: PriceStrategy;
  swot: Swot;
  launch: { skeleton: LaunchSkeleton; narrative: string | null };

  offers: StoredOffer[];
  evidence: Array<PiEvidence & { id: string }>;
  scans: StoredScan[];
};

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getAnalysis(id: string): Promise<StoredAnalysis | null> {
  const row = await db.productAnalysis.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, name: true, sku: true } },
      importCase: { select: { id: true, code: true } },
      channel: { select: { id: true, name: true } },
      offers: { orderBy: { rank: "asc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      sources: { orderBy: { fetchedAt: "asc" } },
    },
  });
  if (!row) return null;

  const launchRaw = (row.launchPlan ?? {}) as { skeleton?: LaunchSkeleton; narrative?: string | null };

  return {
    id: row.id,
    code: row.code,
    productName: row.productName,
    marketplace: row.marketplace,
    marketCountry: row.marketCountry,
    status: row.status as AnalysisStatus,
    dataConfidence: row.dataConfidence,
    createdAt: row.createdAt,
    aiSummary: row.aiSummary,
    aiDisabledNote: row.aiDisabledNote,

    itemId: row.item?.id ?? null,
    itemName: row.item?.name ?? null,
    itemSku: row.item?.sku ?? null,
    importCaseId: row.importCase?.id ?? null,
    importCaseCode: row.importCase?.code ?? null,
    channelId: row.channel?.id ?? null,
    channelName: row.channel?.name ?? null,

    attributes: row.inputAttributes as unknown as ProductAttributes,
    scanScope: row.scanScope as unknown as ScanScope,
    market: row.marketProfile as unknown as MarketProfile,
    gapFindings: (row.gapFindings ?? []) as unknown as GapFinding[],
    titles: (row.titleCandidates ?? []) as unknown as TitleCandidate[],
    price: row.priceStrategy as unknown as PriceStrategy,
    swot: row.swot as unknown as Swot,
    launch: { skeleton: (launchRaw.skeleton ?? null) as unknown as LaunchSkeleton, narrative: launchRaw.narrative ?? null },

    offers: row.offers.map((o) => ({
      id: o.id,
      rank: o.rank,
      title: o.title,
      brand: o.brand,
      sellerName: o.sellerName,
      price: toNum(o.price),
      currency: o.currency,
      ratingAvg: toNum(o.ratingAvg),
      ratingCount: o.ratingCount,
      sourceUrl: o.sourceUrl,
      provenance: o.provenance,
      rawExcerpt: o.rawExcerpt,
    })),
    evidence: row.evidence.map((e) => ({
      id: e.id,
      area: e.area as PiEvidence["area"],
      kind: e.kind,
      polarity: e.polarity as PiEvidence["polarity"],
      provenance: e.provenance as PiEvidence["provenance"],
      text: e.text,
      detail: (e.detail ?? undefined) as Record<string, unknown> | undefined,
      sourceKey: e.sourceKey ?? undefined,
    })),
    scans: row.sources.map((s) => ({
      id: s.id,
      marketplace: s.marketplace,
      queryText: s.queryText,
      url: s.url,
      status: s.status as ScanStatus,
      blockKind: s.blockKind,
      httpStatus: s.httpStatus,
      itemsFound: s.itemsFound,
      note: s.note,
      fetchedAt: s.fetchedAt,
      fromCache: s.fromCache,
    })),
  };
}

export async function deleteAnalysis(id: string): Promise<void> {
  await db.productAnalysis.delete({ where: { id } });
}

/** Pickers for the new-analysis form. Small lists; the owner has tens of rows,
 *  not thousands, so this stays a plain read rather than a search endpoint. */
export async function getFormOptions(): Promise<{
  items: Array<{ id: string; label: string; hasAverageCost: boolean }>;
  channels: Array<{ id: string; name: string; commissionRate: number | null }>;
  importCases: Array<{ id: string; label: string }>;
}> {
  const [items, channels, cases] = await Promise.all([
    db.item.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, sku: true, costState: { select: { avgUnitCost: true } } },
    }),
    db.channel.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, commissionRate: true } }),
    db.importCase.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, code: true, productName: true } }),
  ]);

  return {
    items: items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name}`, hasAverageCost: i.costState?.avgUnitCost != null })),
    channels: channels.map((c) => ({ id: c.id, name: c.name, commissionRate: toNum(c.commissionRate) })),
    importCases: cases.map((c) => ({ id: c.id, label: `${c.code} — ${c.productName}` })),
  };
}
