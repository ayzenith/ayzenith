/**
 * AYZENITH LOGISTICS INTELLIGENCE — Market Reference matching (pure, no DB).
 *
 * This is the query-level half of the misapplication guard the DB CHECK
 * constraint (market_reference_weight_scope_consistency) only starts: a
 * reference stated for "≤500 kg" must never be handed back for a 2000 kg
 * query, a 1-pallet price must never be multiplied to answer a 2-pallet
 * query, and a country-level reference must never be presented as if it were
 * specific to a city the source never named. Every rule below exists to
 * make ONE of those a compile-time-obvious "no match" rather than a silent
 * misuse further up the stack.
 */

export type WeightScopeType = "EXACT" | "UP_TO" | "RANGE";
export type MarketReferenceShipmentType = "LTL" | "FTL";

export interface MarketReferenceQuery {
  originCountry: string;
  originCity?: string;
  destCountry: string;
  destCity?: string;
  chargeableWeightKg: number;
  shipmentType: MarketReferenceShipmentType;
  /** Number of units (e.g. pallets) the query is actually about. Left
   *  undefined when the query has no unit concept — never coerced to 1. */
  unitCount?: number;
  queryDate: Date;
}

export interface MatchableMarketReference {
  id: string;
  originCity: string;
  originCountry: string;
  destCity: string | null;
  destCountry: string;
  unitCount: number | null;
  weightScopeType: WeightScopeType;
  weightScopeMinKg: number | null;
  weightScopeMaxKg: number | null;
  shipmentType: MarketReferenceShipmentType | null;
  periodStart: Date;
  periodEnd: Date | null;
}

export interface MatchEvaluation {
  matches: boolean;
  reason: string;
  /** Only meaningful when matches=true: true iff the reference actually
   *  named the query's destination city. False means the match is only at
   *  country level and MUST be labeled as such by any caller. */
  citySpecific: boolean;
}

const noMatch = (reason: string): MatchEvaluation => ({ matches: false, reason, citySpecific: false });

export function evaluateMarketReferenceMatch(
  ref: MatchableMarketReference,
  query: MarketReferenceQuery
): MatchEvaluation {
  if (ref.originCountry !== query.originCountry) {
    return noMatch("origin country mismatch");
  }
  if (ref.destCountry !== query.destCountry) {
    return noMatch("destination country mismatch");
  }

  // No fallback across shipment types: an LTL band says nothing about FTL
  // pricing (different cost structure entirely), and a reference with no
  // stated shipment type is treated as not applicable rather than assumed.
  if (ref.shipmentType !== query.shipmentType) {
    return noMatch("shipment type mismatch (no LTL/FTL fallback)");
  }

  // Never scale a per-unit price. A reference stated for 1 pallet is not
  // "half of" a 2-pallet reference or "1/2 of" any other count — if both
  // sides state a unit count, they must be equal, or there is no match at
  // all (never a multiplied/divided price).
  if (query.unitCount != null && ref.unitCount != null && query.unitCount !== ref.unitCount) {
    return noMatch("unit count mismatch — a per-unit reference is never scaled");
  }

  // Weight-scope containment: the actual misapplication guard. UP_TO has no
  // stated floor (never assumed to be 0 in a way that matters here, but 0 is
  // the honest lower bound of "up to X"); a RANGE/EXACT reference bounds both
  // sides explicitly.
  const min = ref.weightScopeMinKg ?? 0;
  const max = ref.weightScopeMaxKg ?? Number.POSITIVE_INFINITY;
  if (query.chargeableWeightKg < min || query.chargeableWeightKg > max) {
    return noMatch(
      `query weight ${query.chargeableWeightKg}kg outside reference's stated scope [${min}, ${max}]kg`
    );
  }

  // Period containment: a reference published "in 2026" never silently
  // answers a 2025 (or 2027+) query. periodEnd defaults to periodStart for a
  // single stated date.
  const periodEnd = ref.periodEnd ?? ref.periodStart;
  if (query.queryDate < ref.periodStart || query.queryDate > periodEnd) {
    return noMatch("query date outside reference's stated period");
  }

  const citySpecific = ref.destCity != null && query.destCity != null && ref.destCity === query.destCity;

  return { matches: true, reason: "matched", citySpecific };
}
