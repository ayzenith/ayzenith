/**
 * AYZENITH LOGISTICS INTELLIGENCE — estimateability gate (pure, no DB, no ML).
 *
 * Computed BEFORE a price band is produced, not alongside it — a query with
 * INSUFFICIENT estimateability never reaches the point of generating a
 * number. Factors are a simple weighted average on purpose: explainable,
 * auditable, no hidden model.
 */

import type { EvidenceLevel } from "./evidence-level";

export type EstimateabilityBand = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type EstimateabilityFactors = {
  evidenceLevel: EvidenceLevel;
  observationCount: number;
  avgObservationQuality: number; // 0-100
  profileSimilarity: number; // 0-100
  sourceDiversity: number; // distinct sources contributing
};

export type EstimateabilityResult = {
  band: EstimateabilityBand;
  score: number; // 0-100, the raw weighted average, shown for transparency
  factors: EstimateabilityFactors;
};

/** Each evidence level's OWN ceiling — matches the hierarchy's design: even a
 *  perfect score at REGIONAL_INDEX_ONLY can never read as HIGH, because an
 *  index-adjusted corridor base is inherently less certain than a direct
 *  lane observation, no matter how many index points back it. */
const LEVEL_SCORE: Record<EvidenceLevel, number> = {
  DIRECT_LANE: 100,
  NEARBY_LANE: 70,
  COUNTRY_CORRIDOR: 45,
  REGIONAL_INDEX_ONLY: 25,
  NONE: 0,
};
const LEVEL_CEILING: Record<EvidenceLevel, EstimateabilityBand> = {
  DIRECT_LANE: "HIGH",
  NEARBY_LANE: "MEDIUM",
  COUNTRY_CORRIDOR: "LOW",
  REGIONAL_INDEX_ONLY: "LOW",
  NONE: "INSUFFICIENT",
};
const BAND_RANK: Record<EstimateabilityBand, number> = { INSUFFICIENT: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

function bandFromScore(score: number): EstimateabilityBand {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "INSUFFICIENT";
}

export function computeEstimateability(factors: EstimateabilityFactors): EstimateabilityResult {
  if (factors.evidenceLevel === "NONE") {
    return { band: "INSUFFICIENT", score: 0, factors };
  }

  const observationCountScore = Math.min(100, factors.observationCount * 20); // 5+ obs = full marks
  const sourceDiversityScore = Math.min(100, factors.sourceDiversity * 34); // 3+ sources = full marks

  const weighted =
    LEVEL_SCORE[factors.evidenceLevel] * 0.35 +
    observationCountScore * 0.15 +
    factors.avgObservationQuality * 0.2 +
    factors.profileSimilarity * 0.2 +
    sourceDiversityScore * 0.1;

  const scoreBand = bandFromScore(weighted);
  const ceiling = LEVEL_CEILING[factors.evidenceLevel];
  // The evidence level's ceiling always wins if it's stricter than the raw score.
  const band = BAND_RANK[scoreBand] <= BAND_RANK[ceiling] ? scoreBand : ceiling;

  return { band, score: Math.round(weighted), factors };
}
