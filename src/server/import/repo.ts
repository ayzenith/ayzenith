import "server-only";

import { db } from "@/lib/db";
import type { ImportRuleKind } from "@prisma/client";
import { buildNomenclatureIndex, type NomenclatureIndex } from "./classify";
import type { ColumnRuleData, MeasureRuleData, VatRuleData } from "./tax";
import type { ImportCommunique, UgdGroup } from "./parsers";
import { toSourceRef } from "./sources";
import type { SourceRef } from "./types";

/**
 * IMPORT INTELLIGENCE — reads.
 *
 * The nomenclature is ~26k rows and is needed whole for word matching, so it is
 * built once per process and kept, keyed by the source versions it came from: a
 * re-ingestion produces new source ids and the cache rebuilds by itself.
 */

const INDEX_TTL_MS = 15 * 60 * 1000;
let cached: { key: string; at: number; index: NomenclatureIndex } | null = null;
let building: Promise<NomenclatureIndex | null> | null = null;

export type NomenclatureMeta = {
  trSource: SourceRef | null;
  hsSource: SourceRef | null;
  trLineCount: number;
  hsLineCount: number;
};

export async function nomenclatureMeta(): Promise<NomenclatureMeta> {
  const [tr, hs] = await Promise.all([
    db.importSource.findFirst({ where: { key: "TR_TGTC", isCurrent: true } }),
    db.importSource.findFirst({ where: { key: "WCO_HS2022_UN", isCurrent: true } }),
  ]);
  const [trLineCount, hsLineCount] = await Promise.all([
    tr ? db.importTariffLine.count({ where: { sourceId: tr.id } }) : Promise.resolve(0),
    hs ? db.importTariffLine.count({ where: { sourceId: hs.id } }) : Promise.resolve(0),
  ]);
  return { trSource: tr ? toSourceRef(tr) : null, hsSource: hs ? toSourceRef(hs) : null, trLineCount, hsLineCount };
}

export async function loadNomenclatureIndex(): Promise<NomenclatureIndex | null> {
  const [tr, hs] = await Promise.all([
    db.importSource.findFirst({ where: { key: "TR_TGTC", isCurrent: true }, select: { id: true, version: true } }),
    db.importSource.findFirst({ where: { key: "WCO_HS2022_UN", isCurrent: true }, select: { id: true } }),
  ]);
  if (!tr) return null;
  const key = `${tr.id}:${hs?.id ?? "-"}`;
  if (cached && cached.key === key && Date.now() - cached.at < INDEX_TTL_MS) return cached.index;
  if (building) return building;

  building = (async () => {
    const select = { code: true, level: true, description: true, fullDescription: true, unit: true, legalRate474: true } as const;
    const [trLines, hsLines] = await Promise.all([
      db.importTariffLine.findMany({ where: { sourceId: tr.id }, select, orderBy: { sortOrder: "asc" } }),
      hs ? db.importTariffLine.findMany({ where: { sourceId: hs.id }, select, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
    ]);
    const index = buildNomenclatureIndex({
      sourceKey: "TR_TGTC",
      version: tr.version,
      tr: trLines.map((l) => ({ ...l, legalRate474: l.legalRate474 ? Number(l.legalRate474) : null })),
      hs: hsLines.map((l) => ({ ...l, legalRate474: null })),
    });
    cached = { key, at: Date.now(), index };
    building = null;
    return index;
  })();
  return building;
}

/** Every prefix of a GTİP, longest first — the keys a rule may be stated on. */
export function prefixesOf(gtip: string): string[] {
  const out: string[] = [];
  for (let n = gtip.length; n >= 2; n -= 2) out.push(gtip.slice(0, n));
  return out;
}

type RuleRow = {
  id: string;
  gtipPrefix: string;
  originCountry: string | null;
  columnRates: unknown;
  ratePct: unknown;
  rateText: string | null;
  rateType: string;
  footnote: string | null;
  legalRef: string;
  validFrom: Date;
  validUntil: Date | null;
  status: string;
  sourceVersion: string | null;
  meta: unknown;
  source: { key: string; consolidatedAsOf: Date | null; fetchedAt: Date | null };
};

const ruleSelect = {
  id: true,
  gtipPrefix: true,
  originCountry: true,
  columnRates: true,
  ratePct: true,
  rateText: true,
  rateType: true,
  footnote: true,
  legalRef: true,
  validFrom: true,
  validUntil: true,
  status: true,
  sourceVersion: true,
  meta: true,
  source: { select: { key: true, consolidatedAsOf: true, fetchedAt: true } },
} as const;

function asColumnRule(r: RuleRow): ColumnRuleData {
  return {
    id: r.id,
    gtipPrefix: r.gtipPrefix,
    originCountry: r.originCountry,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    status: r.status,
    sourceKey: r.source.key,
    sourceVersion: r.sourceVersion,
    consolidatedAsOf: r.source.consolidatedAsOf,
    columnRates: (r.columnRates ?? {}) as ColumnRuleData["columnRates"],
    footnote: r.footnote,
    legalRef: r.legalRef,
  };
}

function asMeasureRule(r: RuleRow, kind: MeasureRuleData["kind"]): MeasureRuleData {
  return {
    id: r.id,
    gtipPrefix: r.gtipPrefix,
    originCountry: r.originCountry,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    status: r.status,
    sourceKey: r.source.key,
    sourceVersion: r.sourceVersion,
    consolidatedAsOf: r.source.consolidatedAsOf,
    kind,
    ratePct: r.ratePct == null ? null : Number(r.ratePct),
    rateText: r.rateText,
    rateType: r.rateType,
    legalRef: r.legalRef,
    meta: (r.meta ?? null) as MeasureRuleData["meta"],
  };
}

export type RuleBundle = {
  duty: { rules: ColumnRuleData[]; fetchedAt: Date | null; loaded: boolean };
  igv: { rules: ColumnRuleData[]; fetchedAt: Date | null; loaded: boolean };
  measures: { rules: MeasureRuleData[]; fetchedAt: Date | null; listDate: Date | null; loaded: boolean };
  safeguards: { rules: MeasureRuleData[]; fetchedAt: Date | null; loaded: boolean };
  vat: VatRuleData | null;
  sources: SourceRef[];
};

export async function loadRulesFor(gtip: string): Promise<RuleBundle> {
  const prefixes = prefixesOf(gtip);
  const splitPrefix = gtip.slice(0, 10);
  const where = (kinds: ImportRuleKind[]) => ({
    kind: { in: kinds },
    source: { isCurrent: true },
    OR: [{ gtipPrefix: { in: prefixes } }, { gtipPrefix: { startsWith: splitPrefix } }],
  });

  const [duty, igv, measures, safeguards, vat, sourceRows] = await Promise.all([
    db.importRule.findMany({ where: where(["CUSTOMS_DUTY"]), select: ruleSelect }),
    db.importRule.findMany({ where: where(["ADDITIONAL_DUTY"]), select: ruleSelect }),
    db.importRule.findMany({ where: where(["ANTI_DUMPING", "COUNTERVAILING"]), select: { ...ruleSelect, kind: true } }),
    db.importRule.findMany({ where: where(["SAFEGUARD"]), select: ruleSelect }),
    db.importRule.findFirst({ where: { kind: "VAT", source: { isCurrent: true } }, select: ruleSelect, orderBy: { validFrom: "desc" } }),
    db.importSource.findMany({ where: { isCurrent: true, NOT: { key: { startsWith: "WEB:" } } } }),
  ]);

  const byKey = new Map(sourceRows.map((s) => [s.key, s]));
  const fetchedAt = (key: string) => byKey.get(key)?.fetchedAt ?? null;
  const adList = byKey.get("TR_TRADE_DEFENCE_AD");

  return {
    duty: { rules: duty.map(asColumnRule), fetchedAt: fetchedAt("TR_IRK_II_LIST"), loaded: byKey.has("TR_IRK_II_LIST") },
    igv: { rules: igv.map(asColumnRule), fetchedAt: fetchedAt("TR_IGV_EK1"), loaded: byKey.has("TR_IGV_EK1") },
    measures: {
      rules: measures.map((r) => asMeasureRule(r, r.kind === "COUNTERVAILING" ? "COUNTERVAILING" : "ANTI_DUMPING")),
      fetchedAt: fetchedAt("TR_TRADE_DEFENCE_AD"),
      listDate: adList?.effectiveFrom ?? adList?.publicationDate ?? adList?.fetchedAt ?? null,
      loaded: !!adList,
    },
    safeguards: { rules: safeguards.map((r) => asMeasureRule(r, "SAFEGUARD")), fetchedAt: fetchedAt("TR_TRADE_DEFENCE_SG"), loaded: byKey.has("TR_TRADE_DEFENCE_SG") },
    vat: vat
      ? {
          id: vat.id,
          gtipPrefix: vat.gtipPrefix,
          originCountry: null,
          validFrom: vat.validFrom,
          validUntil: vat.validUntil,
          status: vat.status,
          sourceKey: vat.source.key,
          sourceVersion: vat.sourceVersion,
          consolidatedAsOf: vat.source.consolidatedAsOf,
          ratePct: Number(vat.ratePct ?? 0),
          legalRef: vat.legalRef,
        }
      : null,
    sources: sourceRows.map(toSourceRef),
  };
}

export type ComplianceSources = {
  ugd: { groups: UgdGroup[]; sourceKey: string; available: boolean; pageDate: string | null };
  communiques: { items: ImportCommunique[]; sourceKey: string; available: boolean };
};

export async function loadComplianceSources(): Promise<ComplianceSources> {
  const [ugd, comm] = await Promise.all([
    db.importSource.findFirst({ where: { key: "TR_UGD_GROUPS", isCurrent: true } }),
    db.importSource.findFirst({ where: { key: "TR_IMPORT_COMMUNIQUES", isCurrent: true } }),
  ]);
  const ugdParsed = (ugd?.parsed ?? null) as { groups?: UgdGroup[] } | null;
  const commParsed = (comm?.parsed ?? null) as { items?: ImportCommunique[] } | null;
  return {
    ugd: {
      groups: ugdParsed?.groups ?? [],
      sourceKey: "TR_UGD_GROUPS",
      available: !!ugd && ugd.status === "OK" && (ugdParsed?.groups?.length ?? 0) > 0,
      pageDate: ugd?.publicationDate ? ugd.publicationDate.toISOString().slice(0, 10) : null,
    },
    communiques: {
      items: commParsed?.items ?? [],
      sourceKey: "TR_IMPORT_COMMUNIQUES",
      available: !!comm && comm.status === "OK" && (commParsed?.items?.length ?? 0) > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export async function listImportCases(opts: { page?: number; perPage?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const [rows, total] = await Promise.all([
    db.importCase.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, code: true, productName: true, predictedGtip: true, userGtip: true, classificationStatus: true,
        originCountry: true, dispatchCountry: true, importDate: true, createdAt: true, purchaseId: true,
        statusSummary: true,
        candidates: { where: { selected: true }, select: { confidencePct: true, gtip: true }, take: 1 },
      },
    }),
    db.importCase.count(),
  ]);
  return { rows, total, page, perPage };
}

export async function getImportCase(id: string) {
  return db.importCase.findUnique({
    where: { id },
    include: {
      candidates: { orderBy: { rank: "asc" } },
      evidence: { include: { source: { select: { key: true, name: true, url: true, tier: true, fetchedAt: true, status: true } } } },
      item: { select: { id: true, sku: true, name: true } },
      supplier: { select: { id: true, name: true } },
      purchase: { select: { id: true, code: true, status: true } },
    },
  });
}
