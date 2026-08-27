import "server-only";

import { db } from "@/lib/db";
import type { AnalysisResult } from "./analyze";

/**
 * AYZENITH RADAR — snapshot repository (immutable history + comparison).
 *
 * A snapshot is written once and never updated: a re-analysis creates a new row.
 * It freezes everything needed to reproduce and compare a result — inputs,
 * resolved HS, criteria, final score, the weights in force at that moment,
 * confidence, sub-categories and every citation. This is what makes "3 ay sonra
 * ne değişti?" answerable and what stops a later weight change from rewriting
 * history.
 */

export type SavedSnapshot = { id: string };

/** Persist an AnalysisResult as an immutable snapshot (+ its citations). */
export async function saveSnapshot(
  result: AnalysisResult,
  opts: { watchId?: string; aiSummary?: string | null } = {},
): Promise<SavedSnapshot> {
  const snapshot = await db.radarSnapshot.create({
    data: {
      categoryKey: result.categoryKey,
      geoScope: result.geoScope,
      countryCode: result.countryCode,
      countryLabel: result.countryLabel,
      supplyMarket: result.supplyMarket,
      tradeModel: result.tradeModel,
      analysisType: result.analysisType,
      productName: result.productName,
      hsCode: result.hsCode,
      resolvedHs: result.resolvedHs,
      criteria: result.criteria as object,
      finalScore: result.finalScore,
      decision: result.decision,
      weightsUsed: result.weightsUsed,
      confidence: result.confidence,
      measuredCriteria: result.measuredCriteria,
      subCategories: result.subCategories as object,
      errors: result.errors as object,
      // Per-criterion WHY behind the confidence number (§ accuracy Phase 4).
      // Frozen with the snapshot like everything else here, so a later re-run
      // with better coverage never rewrites what THIS run actually saw.
      completenessBreakdown: Object.fromEntries(
        result.criteria.map((c) => [c.key, c.completenessParts]),
      ) as object,
      aiSummary: opts.aiSummary ?? null,
      watchId: opts.watchId ?? null,
      citations: {
        create: result.citations.map((c) => ({
          provider: c.provider,
          label: c.label,
          query: c.query as object,
          rawValue: c.rawValue,
          unit: c.unit ?? null,
          sourceUrl: c.sourceUrl ?? null,
          fetchedAt: new Date(c.fetchedAt),
          criterionKeys: c.criterionKeys ?? [],
        })),
      },
    },
    select: { id: true },
  });
  return { id: snapshot.id };
}

export type SnapshotSummary = {
  id: string;
  categoryKey: string;
  countryCode: string;
  countryLabel: string;
  finalScore: number | null;
  decision: string;
  confidence: number;
  createdAt: Date;
};

export async function getSnapshot(id: string) {
  return db.radarSnapshot.findUnique({
    where: { id },
    include: { citations: true },
  });
}

export async function listSnapshots(limit = 30): Promise<SnapshotSummary[]> {
  return db.radarSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      categoryKey: true,
      countryCode: true,
      countryLabel: true,
      finalScore: true,
      decision: true,
      confidence: true,
      createdAt: true,
    },
  });
}

/** History for one market (category+country), newest first — powers comparison. */
export async function listSnapshotsForMarket(
  categoryKey: string,
  countryCode: string,
  limit = 12,
) {
  return db.radarSnapshot.findMany({
    where: { categoryKey, countryCode },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { citations: true },
  });
}

// ----------------------------------------------------------------------------
// Comparison — the data-grounded "what changed" behind a watch alert.
// ----------------------------------------------------------------------------

export type SnapshotComparison = {
  currentScore: number | null;
  previousScore: number | null;
  scoreDelta: number | null;
  direction: "up" | "down" | "flat";
  /** Real, sourced reasons — extracted from the frozen criteria, not the AI. */
  reasons: string[];
};

type CriterionJson = {
  key: string;
  score: number | null;
  rawInputs?: Record<string, number | string | boolean | null>;
};

function criterionRaw(criteria: unknown, key: string, field: string): number | null {
  const arr = Array.isArray(criteria) ? (criteria as CriterionJson[]) : [];
  const c = arr.find((x) => x.key === key);
  const v = c?.rawInputs?.[field];
  return typeof v === "number" ? v : null;
}

/**
 * Compare two frozen snapshots and derive the real drivers of the score change
 * straight from their stored raw inputs (import volume, TR share). The AI later
 * only phrases these; it never invents them.
 */
export function compareSnapshots(
  current: { finalScore: number | null; criteria: unknown },
  previous: { finalScore: number | null; criteria: unknown } | null,
): SnapshotComparison {
  const currentScore = current.finalScore;
  const previousScore = previous?.finalScore ?? null;
  let scoreDelta: number | null = null;
  let direction: "up" | "down" | "flat" = "flat";

  if (currentScore != null && previousScore != null) {
    scoreDelta = currentScore - previousScore;
    direction = scoreDelta > 0 ? "up" : scoreDelta < 0 ? "down" : "flat";
  }

  const reasons: string[] = [];
  if (previous) {
    const impNow = criterionRaw(current.criteria, "demand", "targetImport");
    const impPrev = criterionRaw(previous.criteria, "demand", "targetImport");
    if (impNow != null && impPrev != null && impPrev > 0) {
      const pct = ((impNow - impPrev) / impPrev) * 100;
      if (Math.abs(pct) >= 1) {
        reasons.push(`İthalat hacmi %${pct > 0 ? "+" : ""}${pct.toFixed(1)}`);
      }
    }
    const shareNow = criterionRaw(current.criteria, "supplyAdvantage", "trSharePct");
    const sharePrev = criterionRaw(previous.criteria, "supplyAdvantage", "trSharePct");
    if (shareNow != null && sharePrev != null) {
      const d = shareNow - sharePrev;
      if (Math.abs(d) >= 0.1) {
        reasons.push(`Türkiye'nin payı ${d > 0 ? "+" : ""}${d.toFixed(1)} puan`);
      }
    }
  }

  return { currentScore, previousScore, scoreDelta, direction, reasons };
}
