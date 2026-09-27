/**
 * PRODUCT INTELLIGENCE — what the scanned market looks like (pure).
 *
 * Plain descriptive statistics over the offers that were actually read. Every
 * figure states the count it came from, because a median of four listings and a
 * median of four hundred are different kinds of fact and the screen has to be
 * able to tell them apart.
 *
 * Offers with no price are counted but never priced: `offerCount` and
 * `pricedCount` are separate for exactly that reason.
 */

import { MIN_OFFERS_FOR_MARKET } from "@/config/product-intel";
import { facetDistribution, type ValueCount } from "./gap";
import type { OfferView } from "./types";

export type PriceStats = {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

export type PriceSegment = {
  key: string;
  label: string;
  from: number;
  to: number;
  count: number;
  pct: number;
};

export type MarketProfile = {
  offerCount: number;
  pricedCount: number;
  currency: string;
  priceStats: PriceStats | null;
  segments: PriceSegment[];
  brands: ValueCount[];
  sellers: ValueCount[];
  /** How concentrated the shelf is: share of the top three sellers. */
  sellerConcentrationPct: number | null;
  rating: { ratedCount: number; avgRating: number; medianReviewCount: number; maxReviewCount: number } | null;
  facets: Array<{ key: string; label: string; readableCount: number; values: ValueCount[] }>;
  sufficient: boolean;
  notes: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Linear-interpolated percentile on an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function countBy(values: Array<string | null>): ValueCount[] {
  const present = values.filter((v): v is string => !!v && v.trim() !== "");
  const counts = new Map<string, number>();
  for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, pct: Math.round((count / present.length) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);
}

export function computeMarketProfile(offers: OfferView[], baseCurrency: string): MarketProfile {
  const notes: string[] = [];
  const priced = offers.filter((o) => o.price != null && o.price > 0);
  const prices = priced.map((o) => o.price!).sort((a, b) => a - b);

  let priceStats: PriceStats | null = null;
  const segments: PriceSegment[] = [];

  if (prices.length > 0) {
    priceStats = {
      count: prices.length,
      min: r2(prices[0]!),
      p25: r2(percentile(prices, 0.25)),
      median: r2(percentile(prices, 0.5)),
      p75: r2(percentile(prices, 0.75)),
      max: r2(prices[prices.length - 1]!),
      mean: r2(prices.reduce((s, p) => s + p, 0) / prices.length),
    };

    // Quartile segments. Edges come from the observed distribution rather than
    // from round numbers, so a segment always contains real listings.
    const edges = [priceStats.min, priceStats.p25, priceStats.median, priceStats.p75, priceStats.max];
    const labels = ["Giriş segmenti", "Orta-alt segment", "Orta-üst segment", "Üst segment"];
    for (let i = 0; i < 4; i += 1) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      // The last bucket is inclusive at the top so the maximum listing lands
      // somewhere instead of falling off the end.
      const count = prices.filter((p) => (i === 3 ? p >= from && p <= to : p >= from && p < to)).length;
      segments.push({
        key: `Q${i + 1}`,
        label: labels[i]!,
        from: r2(from),
        to: r2(to),
        count,
        pct: Math.round((count / prices.length) * 1000) / 10,
      });
    }
  } else if (offers.length > 0) {
    notes.push("Hiçbir rakip ilanda fiyat okunamadı; fiyat dağılımı hesaplanmadı.");
  }

  const sellers = countBy(offers.map((o) => o.sellerName));
  const sellerConcentrationPct =
    sellers.length > 0 ? Math.round(sellers.slice(0, 3).reduce((s, x) => s + x.pct, 0) * 10) / 10 : null;

  const rated = offers.filter((o) => o.ratingAvg != null);
  const reviewCounts = offers.map((o) => o.ratingCount ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const rating =
    rated.length > 0
      ? {
          ratedCount: rated.length,
          avgRating: Math.round((rated.reduce((s, o) => s + (o.ratingAvg ?? 0), 0) / rated.length) * 100) / 100,
          medianReviewCount: reviewCounts.length > 0 ? Math.round(percentile(reviewCounts, 0.5)) : 0,
          maxReviewCount: reviewCounts.length > 0 ? reviewCounts[reviewCounts.length - 1]! : 0,
        }
      : null;

  const sufficient = offers.length >= MIN_OFFERS_FOR_MARKET;
  if (!sufficient) {
    notes.push(
      `Pazar profili için en az ${MIN_OFFERS_FOR_MARKET} rakip ilan gerekiyor; ${offers.length} ilan girildi. Rakamlar gösteriliyor ama üzerine karar kurulmamalı.`,
    );
  }

  return {
    offerCount: offers.length,
    pricedCount: priced.length,
    currency: baseCurrency,
    priceStats,
    segments,
    brands: countBy(offers.map((o) => o.brand)),
    sellers,
    sellerConcentrationPct,
    rating,
    facets: facetDistribution(offers.map((o) => ({ rank: o.rank, normalized: o.normalized }))),
    sufficient,
    notes,
  };
}

/** The named market points the price screen plots against the bands. */
export function marketAnchors(profile: MarketProfile): Array<{ key: string; label: string; price: number }> {
  if (!profile.priceStats) return [];
  const s = profile.priceStats;
  return [
    { key: "MARKET_P25", label: "Pazar alt çeyrek", price: s.p25 },
    { key: "MARKET_MEDIAN", label: "Pazar medyanı", price: s.median },
    { key: "MARKET_P75", label: "Pazar üst çeyrek", price: s.p75 },
  ];
}
