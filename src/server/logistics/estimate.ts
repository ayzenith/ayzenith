import "server-only";

import { db } from "@/lib/db";
import { resolveEvidence } from "./evidence";
import { computeBenchmark, type BenchmarkMember } from "./benchmark";
import { computeEstimateability } from "./estimateability";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — orchestrator.
 *
 * Ties the whole chain together: EVIDENCE → BENCHMARK → ESTIMATEABILITY →
 * ESTIMATE. Writes exactly one immutable LogisticsEstimate row per call — a
 * re-query is a new row, never an update (mirrors RadarSnapshot).
 *
 * The shown band is the benchmark's INTERQUARTILE range (p25-p75), not its
 * raw min-max: min/max stay on the benchmark for full transparency, but
 * presenting the extremes as "the estimate" would let a single legitimate-but-
 * unusual observation blow the band out to something misleading even after
 * MAD outlier filtering already ran.
 *
 * WHAT HAS ACTUALLY BEEN PROVEN, AS OF 2026-08-24 — read this before claiming
 * more than it says. The 8-test verification run (evidence fallback A→B→C→
 * NONE, the REGIONAL_INDEX_ONLY confidence ceiling, outlier flagging,
 * immutability, actual-cost comparison, full-cleanup) proves the PIPELINE
 * obeys its own safety rules when given data. It does NOT prove the pipeline
 * predicts real freight cost accurately — that requires real lane
 * observations (still zero) and a real CalibrationRun history comparing
 * estimates to LogisticsActualCost over time. Until that exists, say "the
 * estimation infrastructure is verified safe," never "logistics cost
 * estimation works." The EU Oil Bulletin ingestion (sources/eu-oil-bulletin.ts)
 * is the first REAL data in this system — but it is an INDEX signal only
 * (see evidence.ts: REGIONAL_INDEX_ONLY cannot stand alone), not a lane
 * price, so it does not by itself change this conclusion either.
 */

export type EstimateQuery = {
  originCity: string;
  originCountry: string;
  destCity: string;
  destCountry: string;
  shipmentType: "LTL" | "FTL";
  chargeableWeightKg: number;
};

/** How far a query's own weight may sit from an observation's weight for that
 *  observation to still count as "the same profile bucket". */
const WEIGHT_BUCKET_TOLERANCE = 0.2; // ±20%

export async function resolveLogisticsEstimate(query: EstimateQuery) {
  const evidence = await resolveEvidence({
    originCity: query.originCity,
    originCountry: query.originCountry,
    destCity: query.destCity,
    destCountry: query.destCountry,
    shipmentType: query.shipmentType,
  });

  if (evidence.level === "NONE" || evidence.observationIds.length === 0) {
    return persistInsufficient(evidence.laneId, query, evidence.level, "Bu güzergah için hiçbir gözlem bulunamadı.");
  }

  const weightMin = query.chargeableWeightKg * (1 - WEIGHT_BUCKET_TOLERANCE);
  const weightMax = query.chargeableWeightKg * (1 + WEIGHT_BUCKET_TOLERANCE);

  const observations = await db.logisticsNormalizedObservation.findMany({
    where: {
      id: { in: evidence.observationIds },
      chargeableWeightKg: { gte: weightMin, lte: weightMax },
    },
    include: { rawObservation: { include: { source: true } } },
  });

  if (observations.length === 0) {
    return persistInsufficient(
      evidence.laneId,
      query,
      evidence.level,
      `Bu güzergahta gözlem var ama hiçbiri ${query.chargeableWeightKg}kg profiline yakın değil.`,
    );
  }

  const now = Date.now();
  const members: BenchmarkMember[] = observations.map((o) => {
    const ageDays = (now - o.rawObservation.observedAt.getTime()) / (24 * 60 * 60 * 1000);
    const freshness = Math.max(0, 1 - ageDays / 365); // linear decay over a year
    const sourceQuality = o.rawObservation.source.authorityScore / 100;
    const observationQuality = freshness * (o.normalizationConfidence / 100);
    return { normalizedObservationId: o.id, priceEur: Number(o.priceEur), weight: sourceQuality * observationQuality };
  });

  const benchmarkResult = computeBenchmark(members, "WEIGHTED_MEDIAN");
  if (!benchmarkResult) {
    return persistInsufficient(evidence.laneId, query, evidence.level, "Gözlemler ağırlıklandırılamadı.");
  }

  const avgObservationQuality =
    (members.reduce((s, m) => s + m.weight, 0) / members.length) * 100;
  const profileSimilarity =
    100 -
    (observations.reduce((s, o) => s + Math.abs(o.chargeableWeightKg - query.chargeableWeightKg), 0) /
      observations.length /
      query.chargeableWeightKg) *
      100;
  const sourceDiversity = new Set(observations.map((o) => o.rawObservation.sourceId)).size;

  const estimateability = computeEstimateability({
    evidenceLevel: evidence.level,
    observationCount: benchmarkResult.sampleSize,
    avgObservationQuality: Math.round(avgObservationQuality),
    profileSimilarity: Math.round(Math.max(0, profileSimilarity)),
    sourceDiversity,
  });

  const benchmark = await db.logisticsBenchmark.create({
    data: {
      laneId: evidence.laneId ?? (await ensureLane(query)),
      shipmentType: query.shipmentType,
      weightBucketMinKg: weightMin,
      weightBucketMaxKg: weightMax,
      calculationMethod: "WEIGHTED_MEDIAN",
      medianPriceEur: benchmarkResult.medianPriceEur,
      p25PriceEur: benchmarkResult.p25PriceEur,
      p75PriceEur: benchmarkResult.p75PriceEur,
      minPriceEur: benchmarkResult.minPriceEur,
      maxPriceEur: benchmarkResult.maxPriceEur,
      sampleSize: benchmarkResult.sampleSize,
      freshnessScore: Math.round(avgObservationQuality),
      members: { create: members.map((m) => ({ normalizedObservationId: m.normalizedObservationId, weight: m.weight })) },
    },
  });

  if (estimateability.band === "INSUFFICIENT") {
    return persistInsufficient(
      evidence.laneId,
      query,
      evidence.level,
      "Kanıt var ama kalitesi/profil benzerliği yeterli değil.",
      benchmark.id,
      estimateability,
    );
  }

  const estimate = await db.logisticsEstimate.create({
    data: {
      laneId: benchmark.laneId,
      benchmarkId: benchmark.id,
      queryProfile: query as object,
      evidenceLevel: evidence.level,
      estimateability: estimateability.band,
      estimateabilityFactors: estimateability.factors as object,
      estimateMethod: "benchmark_weighted_median",
      sourceObservationIds: benchmarkResult.memberIds,
      estimatedMinEur: benchmarkResult.p25PriceEur,
      estimatedMaxEur: benchmarkResult.p75PriceEur,
      citations: buildCitations(observations),
    },
  });

  return { estimate, benchmark, estimateability };
}

async function ensureLane(query: EstimateQuery): Promise<string> {
  const lane = await db.logisticsLane.upsert({
    where: {
      originCity_originCountry_destCity_destCountry_mode: {
        originCity: query.originCity,
        originCountry: query.originCountry,
        destCity: query.destCity,
        destCountry: query.destCountry,
        mode: "ROAD",
      },
    },
    create: {
      originCity: query.originCity,
      originCountry: query.originCountry,
      destCity: query.destCity,
      destCountry: query.destCountry,
      mode: "ROAD",
      corridorType: query.originCountry === query.destCountry ? "DOMESTIC_EU" : "TR_EU_CROSS_BORDER",
    },
    update: {},
  });
  return lane.id;
}

function buildCitations(
  observations: Array<{
    id: string;
    priceEur: unknown;
    priceBasis: string;
    priceMinEur: unknown;
    priceMaxEur: unknown;
    rawObservation: { observedAt: Date; source: { name: string } };
  }>,
) {
  return observations.map((o) => ({
    normalizedObservationId: o.id,
    priceEur: Number(o.priceEur),
    // If the source actually stated a range, the citation must say so — a
    // reader asking "where did 170 come from" deserves "120-220, midpoint
    // taken," never a bare 170 presented as if the source said that exactly.
    priceBasis: o.priceBasis,
    priceRangeEur: o.priceBasis === "RANGE_MIDPOINT" ? { min: Number(o.priceMinEur), max: Number(o.priceMaxEur) } : null,
    observedAt: o.rawObservation.observedAt.toISOString(),
    sourceName: o.rawObservation.source.name,
  }));
}

async function persistInsufficient(
  laneId: string | null,
  query: EstimateQuery,
  evidenceLevel: Awaited<ReturnType<typeof resolveEvidence>>["level"],
  reason: string,
  benchmarkId?: string,
  estimateability?: { band: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; score: number; factors: object },
) {
  const resolvedLaneId = laneId ?? (await ensureLane(query));
  const estimate = await db.logisticsEstimate.create({
    data: {
      laneId: resolvedLaneId,
      benchmarkId: benchmarkId ?? null,
      queryProfile: query as object,
      evidenceLevel,
      estimateability: estimateability?.band ?? "INSUFFICIENT",
      estimateabilityFactors: (estimateability?.factors ?? {}) as object,
      estimateMethod: "insufficient",
      sourceObservationIds: [],
      estimatedMinEur: null,
      estimatedMaxEur: null,
      insufficientReason: reason,
      citations: [],
    },
  });
  return { estimate, benchmark: null, estimateability: estimateability ?? null };
}
