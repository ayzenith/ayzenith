import "server-only";

import { db } from "@/lib/db";
import { normalizeObservation, type RawShipmentInput } from "./normalize";
import { flagOutliers } from "./validate";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — ingestion (writes Raw + Normalized rows).
 *
 * MVP note: `priceEur` assumes the caller has already converted the source's
 * currency to EUR (or the source was already EUR). A real currency-conversion
 * step belongs here once a second currency source actually shows up — adding
 * it speculatively now would be exactly the kind of invented coefficient this
 * module's whole design exists to avoid.
 */

export type IngestInput = {
  sourceId: string;
  laneId?: string | null;
  rawShipmentDescription?: string | null;
  rawPriceEur: number;
  observedAt: Date;
  rawPayload: unknown;
  shipment: RawShipmentInput;
};

export async function ingestRawObservation(
  input: IngestInput,
): Promise<{ rawId: string; normalizedId: string | null }> {
  const raw = await db.logisticsRawObservation.create({
    data: {
      sourceId: input.sourceId,
      laneId: input.laneId ?? null,
      rawShipmentDescription: input.rawShipmentDescription ?? null,
      rawPrice: input.rawPriceEur,
      rawCurrency: "EUR",
      observedAt: input.observedAt,
      rawPayload: input.rawPayload as object,
    },
  });

  const profile = normalizeObservation(input.shipment);
  if (profile.chargeableWeightKg == null) {
    // Nothing to compare this observation against — kept as raw for the
    // audit trail, but it can never enter a benchmark.
    return { rawId: raw.id, normalizedId: null };
  }

  const normalized = await db.logisticsNormalizedObservation.create({
    data: {
      rawObservationId: raw.id,
      chargeableWeightKg: profile.chargeableWeightKg,
      volumeM3: profile.volumeM3,
      palletCount: profile.palletCount,
      shipmentType: profile.shipmentType,
      incoterm: profile.incoterm,
      tollIncluded: profile.tollIncluded,
      fuelIncluded: profile.fuelIncluded,
      priceEur: input.rawPriceEur,
      normalizationConfidence: profile.normalizationConfidence,
      normalizationMethod: profile.weightMethod,
    },
  });

  return { rawId: raw.id, normalizedId: normalized.id };
}

/**
 * Re-runs outlier flagging across every normalized observation in one profile
 * bucket (same lane + mode + shipment type + weight range). Idempotent —
 * upserts each observation's LogisticsValidation row, so re-running after new
 * observations arrive re-evaluates the whole bucket rather than drifting.
 */
export async function revalidateBucket(params: {
  laneId: string;
  shipmentType: "LTL" | "FTL";
  weightBucketMinKg: number;
  weightBucketMaxKg: number;
}): Promise<{ evaluated: number; flagged: number }> {
  const members = await db.logisticsNormalizedObservation.findMany({
    where: {
      shipmentType: params.shipmentType,
      chargeableWeightKg: { gte: params.weightBucketMinKg, lte: params.weightBucketMaxKg },
      rawObservation: { laneId: params.laneId },
    },
    select: { id: true, priceEur: true },
  });
  if (members.length === 0) return { evaluated: 0, flagged: 0 };

  const results = flagOutliers(members.map((m) => Number(m.priceEur)));
  let flagged = 0;
  await Promise.all(
    members.map((m, i) => {
      const r = results[i]!;
      if (r.outlierFlag) flagged++;
      return db.logisticsValidation.upsert({
        where: { normalizedObservationId: m.id },
        create: {
          normalizedObservationId: m.id,
          rawValue: r.rawValue,
          validatedValue: r.validatedValue,
          outlierFlag: r.outlierFlag,
          outlierReason: r.outlierReason,
        },
        update: {
          outlierFlag: r.outlierFlag,
          outlierReason: r.outlierReason,
        },
      });
    }),
  );
  return { evaluated: members.length, flagged };
}
