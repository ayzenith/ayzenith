/**
 * PRODUCT INTELLIGENCE — how much this analysis is worth (pure).
 *
 * The confidence figure is COMPUTED, not judged: sample size, how much of that
 * sample was actually readable, and whether the cost underneath the price work
 * is real. It is the number the operator should look at before believing
 * anything else on the screen, so it is deliberately hard to inflate — a
 * hundred listings none of which state a price do not buy confidence.
 *
 * RADAR does the same thing with its `confidence` percentage and the same rule
 * applies here: this is a statement about our DATA, never about the market.
 */

import { MIN_OFFERS_FOR_MARKET } from "@/config/product-intel";
import type { CostBasis } from "./cost-source";
import type { GapFinding } from "./gap";
import type { AnalysisStatus } from "./types";

export type ConfidenceComponent = {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  note: string;
};

export type ConfidenceResult = {
  score: number;
  components: ConfidenceComponent[];
};

/** Offers beyond this add no further confidence — the curve flattens. */
const COMFORTABLE_SAMPLE = 30;

export function computeConfidence(args: {
  offerCount: number;
  pricedCount: number;
  gapFindings: GapFinding[];
  costBasis: CostBasis;
}): ConfidenceResult {
  const components: ConfidenceComponent[] = [];

  // 1 — sample size (40)
  const sampleRatio = Math.min(1, args.offerCount / COMFORTABLE_SAMPLE);
  components.push({
    key: "SAMPLE",
    label: "Örneklem büyüklüğü",
    points: Math.round(sampleRatio * 40),
    maxPoints: 40,
    note: `${args.offerCount} rakip ilan okundu (${COMFORTABLE_SAMPLE} ilan tam puan).`,
  });

  // 2 — could we read prices at all (25)
  const priceRatio = args.offerCount === 0 ? 0 : args.pricedCount / args.offerCount;
  components.push({
    key: "PRICE_READ",
    label: "Fiyat okunabilirliği",
    points: Math.round(priceRatio * 25),
    maxPoints: 25,
    note:
      args.offerCount === 0
        ? "Rakip ilan yok."
        : `${args.offerCount} ilandan ${args.pricedCount}'inde fiyat okunabildi.`,
  });

  // 3 — could we read the features we are comparing (20)
  const measurable = args.gapFindings.filter((g) => g.readableCount > 0);
  const facetRatio =
    args.offerCount === 0 || args.gapFindings.length === 0
      ? 0
      : measurable.reduce((s, g) => s + g.readableCount / args.offerCount, 0) / args.gapFindings.length;
  components.push({
    key: "FACET_READ",
    label: "Özellik okunabilirliği",
    points: Math.round(Math.min(1, facetRatio) * 20),
    maxPoints: 20,
    note:
      args.gapFindings.length === 0
        ? "Karşılaştırılabilir ürün özelliği çıkarılamadı."
        : `${args.gapFindings.length} özellikte ilanların ortalama %${Math.round(facetRatio * 100)}'i okunabildi.`,
  });

  // 4 — is the cost real (15)
  const costPoints =
    args.costBasis.kind === "AVERAGE_COST" ? 15 : args.costBasis.kind === "LANDED_COST" ? 12 : args.costBasis.kind === "USER_ASSUMPTION" ? 6 : 0;
  components.push({
    key: "COST",
    label: "Maliyet tabanı",
    points: costPoints,
    maxPoints: 15,
    note: args.costBasis.label + (args.costBasis.isAssumption ? " — ölçülmedi" : ""),
  });

  const score = Math.max(0, Math.min(100, components.reduce((s, c) => s + c.points, 0)));
  return { score, components };
}

/**
 * The analysis-level verdict.
 *
 * BLOCKED is reserved for "we tried to read sources and every one of them
 * refused or failed" — it must never be used for "the operator pasted nothing",
 * which is INSUFFICIENT_DATA. Confusing the two is precisely the mistake the
 * scan ledger exists to prevent.
 */
export function decideStatus(args: {
  offerCount: number;
  attemptedSources: number;
  failedSources: number;
}): AnalysisStatus {
  if (args.offerCount === 0 && args.attemptedSources > 0 && args.failedSources === args.attemptedSources) return "BLOCKED";
  if (args.offerCount < MIN_OFFERS_FOR_MARKET) return "INSUFFICIENT_DATA";
  return "OK";
}
