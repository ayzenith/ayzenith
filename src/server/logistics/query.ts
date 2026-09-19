import "server-only";

import { db } from "@/lib/db";
import { getOsSettings } from "@/server/os/settings";
import { suggestRate } from "@/server/os/fx";
import { docDay } from "@/server/os/fx-tcmb";
import { resolveEvidence } from "./evidence";
import { resolveLogisticsEstimate } from "./estimate";
import { resolveMarketReferences, type MarketReferenceMatch } from "./market-reference";
import { computeChargeableWeight } from "./normalize";

/**
 * The one sanctioned composition point (architecture freeze, 2026-08-24):
 * estimate, market references and index signals are returned SIDE BY SIDE.
 * Nothing here adds, weights or merges them — each block keeps its own label.
 *
 * Read-only unless real lane evidence exists: a NONE evidence level returns
 * VERİ YETERSİZ directly instead of writing an empty LogisticsEstimate row.
 */

export type LogisticsQueryInput = {
  originCity: string;
  originCountry: string;
  destCity: string;
  destCountry: string;
  shipmentType: "LTL" | "FTL";
  weightKg: number | null;
  volumeM3: number | null;
  palletCount: number | null;
  hsCode: string | null;
  goodsValue: number | null;
  goodsCurrency: string;
  date: Date;
};

export type LogisticsEstimateBlock =
  | { status: "OK"; minEur: number; maxEur: number; evidenceLevel: string; estimateability: string; estimateId: string }
  | { status: "INSUFFICIENT"; reason: string; evidenceLevel: string };

export type LogisticsQueryResult = {
  chargeableWeightKg: number | null;
  weightMethod: string;
  estimate: LogisticsEstimateBlock;
  marketReferences: MarketReferenceMatch[];
  fuel: { country: string; priceEurPerLiter: number; periodStart: Date; sourceName: string }[];
  cnr: { indexValue: number; periodStart: Date; indexName: string; geography: string } | null;
  fx: { baseCurrency: string; eurRate: string | null; goodsRate: string | null; bulletinDay: string | null; source: string };
  transit: { distanceKm: number | null };
};

export async function resolveLogisticsQuery(q: LogisticsQueryInput): Promise<LogisticsQueryResult> {
  const cw = computeChargeableWeight({ weightKg: q.weightKg, volumeM3: q.volumeM3 });

  const [estimate, marketReferences, fuel, cnr, fx, lane] = await Promise.all([
    estimateBlock(q, cw.value),
    cw.value == null
      ? Promise.resolve([])
      : resolveMarketReferences({
          originCountry: q.originCountry,
          originCity: q.originCity,
          destCountry: q.destCountry,
          destCity: q.destCity,
          chargeableWeightKg: cw.value,
          shipmentType: q.shipmentType,
          unitCount: q.palletCount ?? undefined,
          queryDate: q.date,
        }),
    latestFuel([q.originCountry, q.destCountry]),
    latestCnr(),
    fxBlock(q.goodsCurrency, q.date),
    db.logisticsLane.findFirst({
      where: {
        originCity: q.originCity,
        originCountry: q.originCountry,
        destCity: q.destCity,
        destCountry: q.destCountry,
        mode: "ROAD",
      },
      select: { distanceKm: true },
    }),
  ]);

  return {
    chargeableWeightKg: cw.value,
    weightMethod: cw.method,
    estimate,
    marketReferences,
    fuel,
    cnr,
    fx,
    transit: { distanceKm: lane?.distanceKm ?? null },
  };
}

async function estimateBlock(q: LogisticsQueryInput, chargeableWeightKg: number | null): Promise<LogisticsEstimateBlock> {
  if (chargeableWeightKg == null) {
    return { status: "INSUFFICIENT", reason: "Ağırlık veya hacim girilmedi.", evidenceLevel: "NONE" };
  }
  const lane = { originCity: q.originCity, originCountry: q.originCountry, destCity: q.destCity, destCountry: q.destCountry };
  const evidence = await resolveEvidence({ ...lane, shipmentType: q.shipmentType });
  if (evidence.level === "NONE") {
    return { status: "INSUFFICIENT", reason: "Bu güzergah için gerçek taşıma gözlemi yok.", evidenceLevel: "NONE" };
  }

  const { estimate } = await resolveLogisticsEstimate({ ...lane, shipmentType: q.shipmentType, chargeableWeightKg });
  if (estimate.estimatedMinEur == null || estimate.estimatedMaxEur == null) {
    return {
      status: "INSUFFICIENT",
      reason: estimate.insufficientReason ?? "Kanıt yetersiz.",
      evidenceLevel: estimate.evidenceLevel,
    };
  }
  return {
    status: "OK",
    minEur: Number(estimate.estimatedMinEur),
    maxEur: Number(estimate.estimatedMaxEur),
    evidenceLevel: estimate.evidenceLevel,
    estimateability: estimate.estimateability,
    estimateId: estimate.id,
  };
}

async function latestFuel(countries: string[]) {
  const out: LogisticsQueryResult["fuel"] = [];
  for (const country of [...new Set(countries)]) {
    const row = await db.logisticsFuelIndexObservation.findFirst({
      where: { country, fuelType: "DIESEL", plausible: true },
      orderBy: { periodStart: "desc" },
      include: { source: { select: { name: true } } },
    });
    if (row) {
      out.push({
        country,
        priceEurPerLiter: Number(row.priceEurPerLiter),
        periodStart: row.periodStart,
        sourceName: row.source.name,
      });
    }
  }
  return out;
}

async function latestCnr() {
  const row = await db.logisticsCostIndexObservation.findFirst({
    where: { component: "COMPOSITE" },
    orderBy: { periodStart: "desc" },
    include: { definition: { select: { indexName: true, geography: true } } },
  });
  if (!row) return null;
  return {
    indexValue: row.indexValue,
    periodStart: row.periodStart,
    indexName: row.definition.indexName,
    geography: row.definition.geography,
  };
}

/** Real freight actually booked in Business OS — the only real-cost evidence this screen can show. */
export async function listFreightCosts(limit = 20) {
  const rows = await db.costLine.findMany({
    where: { kind: "FREIGHT" },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      sale: { select: { id: true, code: true } },
      purchase: { select: { id: true, code: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    amount: Number(r.amount),
    currency: r.currency,
    occurredAt: r.occurredAt,
    sale: r.sale,
    purchase: r.purchase,
  }));
}

async function fxBlock(goodsCurrency: string, date: Date) {
  const settings = await getOsSettings();
  const day = docDay(date);
  const eur = await suggestRate("EUR", day, settings);
  const goods = goodsCurrency.toUpperCase() === "EUR" ? eur : await suggestRate(goodsCurrency, day, settings);
  return {
    baseCurrency: settings.baseCurrency,
    eurRate: eur.rate,
    goodsRate: goods.rate,
    bulletinDay: eur.bulletinDay,
    source: eur.source,
  };
}
