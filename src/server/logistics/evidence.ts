import "server-only";

import { db } from "@/lib/db";
import type { EvidenceLevel } from "./evidence-level";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — evidence hierarchy (the A/B/C/D fallback).
 *
 * Each level down is a WEAKER claim, and the estimateability ceiling in
 * estimateability.ts enforces that a lower level can never read as more
 * confident than its own kind of evidence deserves — this file only decides
 * WHICH observations back an estimate, never how confident to be about them.
 *
 * D (REGIONAL_INDEX_ONLY) is architecturally reserved but NOT implemented in
 * this pass: it requires the EU fuel-bulletin/CNR index providers, which are
 * separate future work. Until those exist, a corridor with no direct evidence
 * correctly falls through to NONE rather than pretending an index exists.
 */

const MIN_DIRECT = 2;
const MIN_NEARBY = 3;
const MIN_CORRIDOR = 1;
/** A direct-lane observation older than this no longer counts as "direct" —
 *  freight costs move with fuel/toll changes, a 2-year-old price is corridor
 *  evidence at best, not lane evidence. */
const DIRECT_FRESHNESS_DAYS = 180;

export type EvidenceResult = {
  level: EvidenceLevel;
  laneId: string | null;
  /** Non-outlier normalized observation ids backing this evidence level. */
  observationIds: string[];
};

async function nonOutlierObservations(where: object): Promise<{ id: string }[]> {
  return db.logisticsNormalizedObservation.findMany({
    where: {
      ...where,
      OR: [{ validation: null }, { validation: { outlierFlag: false } }],
    },
    select: { id: true },
  });
}

export async function resolveEvidence(params: {
  originCity: string;
  originCountry: string;
  destCity: string;
  destCountry: string;
  shipmentType: "LTL" | "FTL";
}): Promise<EvidenceResult> {
  const lane = await db.logisticsLane.findFirst({
    where: {
      originCity: params.originCity,
      originCountry: params.originCountry,
      destCity: params.destCity,
      destCountry: params.destCountry,
      mode: "ROAD",
    },
  });

  // A. DIRECT_LANE — exact lane, fresh, ≥ MIN_DIRECT.
  if (lane) {
    const freshSince = new Date(Date.now() - DIRECT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000);
    const direct = await nonOutlierObservations({
      shipmentType: params.shipmentType,
      rawObservation: { laneId: lane.id, observedAt: { gte: freshSince } },
    });
    if (direct.length >= MIN_DIRECT) {
      return { level: "DIRECT_LANE", laneId: lane.id, observationIds: direct.map((o) => o.id) };
    }
  }

  // B. NEARBY_LANE — any lane sharing the same country pair, fresh, ≥ MIN_NEARBY.
  const siblingLanes = await db.logisticsLane.findMany({
    where: { originCountry: params.originCountry, destCountry: params.destCountry, mode: "ROAD" },
    select: { id: true },
  });
  const laneIds = siblingLanes.map((l) => l.id);
  if (laneIds.length > 0) {
    const freshSince = new Date(Date.now() - DIRECT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000);
    const nearby = await nonOutlierObservations({
      shipmentType: params.shipmentType,
      rawObservation: { laneId: { in: laneIds }, observedAt: { gte: freshSince } },
    });
    if (nearby.length >= MIN_NEARBY) {
      return { level: "NEARBY_LANE", laneId: lane?.id ?? null, observationIds: nearby.map((o) => o.id) };
    }

    // C. COUNTRY_CORRIDOR — same country pair, ANY age, weaker threshold.
    const corridor = await nonOutlierObservations({
      shipmentType: params.shipmentType,
      rawObservation: { laneId: { in: laneIds } },
    });
    if (corridor.length >= MIN_CORRIDOR) {
      return { level: "COUNTRY_CORRIDOR", laneId: lane?.id ?? null, observationIds: corridor.map((o) => o.id) };
    }
  }

  // D. REGIONAL_INDEX_ONLY — not implemented (see module doc).
  return { level: "NONE", laneId: lane?.id ?? null, observationIds: [] };
}
