/**
 * AYZENITH LOGISTICS INTELLIGENCE — benchmark aggregation (pure, no DB).
 *
 * A Benchmark is a median (or weighted median) over observations that already
 * share one profile bucket — never a scaled single observation. Every member
 * keeps its own absolute price; this file only ever aggregates, never scales.
 */

export type BenchmarkMethod = "MEDIAN" | "WEIGHTED_MEDIAN";

export type BenchmarkMember = {
  normalizedObservationId: string;
  priceEur: number;
  /** sourceQuality x observationQuality for this member, 0-1. */
  weight: number;
};

export type BenchmarkResult = {
  calculationMethod: BenchmarkMethod;
  medianPriceEur: number;
  p25PriceEur: number;
  p75PriceEur: number;
  minPriceEur: number;
  maxPriceEur: number;
  sampleSize: number;
  memberIds: string[];
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0] as number;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] as number;
  const loV = sorted[lo] as number;
  const hiV = sorted[hi] as number;
  return loV + (hiV - loV) * (idx - lo);
}

/** Weighted median: sort by price, walk cumulative weight until it crosses
 *  half the total — the standard definition, degrades to the plain median
 *  when every weight is equal. */
function weightedMedian(members: BenchmarkMember[]): number {
  const sorted = [...members].sort((a, b) => a.priceEur - b.priceEur);
  const totalWeight = sorted.reduce((s, m) => s + m.weight, 0);
  if (totalWeight <= 0) return percentile(sorted.map((m) => m.priceEur), 50);
  let cum = 0;
  for (const m of sorted) {
    cum += m.weight;
    if (cum >= totalWeight / 2) return m.priceEur;
  }
  return (sorted[sorted.length - 1] as BenchmarkMember).priceEur;
}

/** Builds a benchmark from members ALREADY filtered to one profile bucket
 *  (same lane, mode, shipment type, weight range) by the caller — this
 *  function does not know or care about buckets, only aggregates what it's
 *  given. Returns null if there is nothing to aggregate (caller's job to
 *  treat that as "no benchmark", never a zero price). */
export function computeBenchmark(
  members: BenchmarkMember[],
  method: BenchmarkMethod = "MEDIAN",
): BenchmarkResult | null {
  if (members.length === 0) return null;

  const prices = members.map((m) => m.priceEur).sort((a, b) => a - b);
  const medianPriceEur = method === "WEIGHTED_MEDIAN" ? weightedMedian(members) : percentile(prices, 50);

  return {
    calculationMethod: method,
    medianPriceEur,
    p25PriceEur: percentile(prices, 25),
    p75PriceEur: percentile(prices, 75),
    minPriceEur: prices[0] as number,
    maxPriceEur: prices[prices.length - 1] as number,
    sampleSize: members.length,
    memberIds: members.map((m) => m.normalizedObservationId),
  };
}
