/**
 * AYZENITH LOGISTICS INTELLIGENCE — profile normalization (pure, no DB).
 *
 * Turns one raw observation into a comparable shipment profile. The one rule
 * that must never be broken here: a normalized observation carries its OWN
 * absolute price and its OWN chargeable weight, never a portable per-kg rate.
 * Nothing in this file computes or returns €/kg, €/km or any other coefficient
 * that a caller could reapply to a different shipment.
 */

export type NormalizationMethod = "AS_REPORTED" | "VOLUMETRIC_COMPUTED" | "MISSING";

export type RawShipmentInput = {
  /** Actual scale weight, if the source stated one. */
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;
  palletCount?: number | null;
  shipmentType?: "LTL" | "FTL" | null;
  incoterm?: string | null;
  tollIncluded?: boolean | null;
  fuelIncluded?: boolean | null;
};

export type NormalizedProfile = {
  chargeableWeightKg: number | null;
  weightMethod: NormalizationMethod;
  volumeM3: number | null;
  palletCount: number | null;
  shipmentType: "LTL" | "FTL" | null;
  incoterm: string | null;
  tollIncluded: boolean | null;
  fuelIncluded: boolean | null;
  /** 0-100. Drops for every field that was MISSING rather than reported. */
  normalizationConfidence: number;
};

/** Standard road-freight volumetric-weight divisor (cm-based), the same
 *  constant real freight forwarders and calculators use. */
const VOLUMETRIC_DIVISOR = 3000;

function volumetricWeightKg(input: RawShipmentInput): number | null {
  const { lengthCm, widthCm, heightCm } = input;
  if (lengthCm == null || widthCm == null || heightCm == null) return null;
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return null;
  return (lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR;
}

/** Chargeable weight = the greater of actual and volumetric — the industry
 *  standard a carrier actually bills on. Returns MISSING (null) only when
 *  NEITHER a real weight nor full dimensions were reported — never a guess. */
export function computeChargeableWeight(
  input: RawShipmentInput,
): { value: number | null; method: NormalizationMethod } {
  const volumetric = volumetricWeightKg(input);
  const actual = input.weightKg ?? null;

  if (actual != null && volumetric != null) {
    return actual >= volumetric
      ? { value: actual, method: "AS_REPORTED" }
      : { value: volumetric, method: "VOLUMETRIC_COMPUTED" };
  }
  if (actual != null) return { value: actual, method: "AS_REPORTED" };
  if (volumetric != null) return { value: volumetric, method: "VOLUMETRIC_COMPUTED" };
  return { value: null, method: "MISSING" };
}

const PROFILE_FIELDS = [
  "weightKg", "volumeM3", "palletCount", "shipmentType", "incoterm", "tollIncluded", "fuelIncluded",
] as const;

/** Normalize a raw shipment description into a comparable profile. Every
 *  field the source didn't state stays null — never filled with an assumed
 *  default that could later be mistaken for a real fact. */
export function normalizeObservation(input: RawShipmentInput): NormalizedProfile {
  const chargeable = computeChargeableWeight(input);

  const presentCount = PROFILE_FIELDS.filter((f) => input[f] != null).length;
  const completeness = presentCount / PROFILE_FIELDS.length;
  // Chargeable weight is the load-bearing field: if it's MISSING, confidence
  // caps low regardless of how complete the rest of the profile is.
  const weightPenalty = chargeable.method === "MISSING" ? 0.4 : chargeable.method === "VOLUMETRIC_COMPUTED" ? 0.9 : 1;
  const normalizationConfidence = Math.round(100 * completeness * weightPenalty);

  return {
    chargeableWeightKg: chargeable.value,
    weightMethod: chargeable.method,
    volumeM3: input.volumeM3 ?? null,
    palletCount: input.palletCount ?? null,
    shipmentType: input.shipmentType ?? null,
    incoterm: input.incoterm ?? null,
    tollIncluded: input.tollIncluded ?? null,
    fuelIncluded: input.fuelIncluded ?? null,
    normalizationConfidence,
  };
}
