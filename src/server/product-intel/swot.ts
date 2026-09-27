/**
 * PRODUCT INTELLIGENCE — SWOT and the launch skeleton (pure).
 *
 * WHY A GENERIC SWOT IS IMPOSSIBLE HERE
 *
 * The thing that makes an AI SWOT worthless is the pressure to fill four boxes.
 * Given an empty quadrant a model will always find something to say, and what
 * it says will be true of any product in any market. So this file never asks
 * for four boxes: each entry is DERIVED from a measurement that already exists
 * — a coverage figure, a price band, a seller concentration — and carries the
 * evidence that produced it. A quadrant with no measurement behind it comes
 * back EMPTY, and the screen says "yeterli veri toplanamadı" instead of
 * inventing a strength.
 *
 * The AI's later job is to phrase these. It cannot add to them.
 */

import type { CostBasis } from "./cost-source";
import type { GapFinding } from "./gap";
import type { KeywordReport } from "./keywords";
import type { MarketProfile } from "./market";
import type { PriceStrategy } from "./price";
import type { PiEvidence, Polarity } from "./types";

export type SwotItem = {
  text: string;
  /** The measurement this came from, shown when the reader clicks through. */
  basis: string;
  detail?: Record<string, unknown>;
};

export type Swot = {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  /** Quadrants with nothing measurable behind them, named honestly. */
  emptyQuadrants: string[];
};

export type LaunchSkeleton = {
  /** Facets worth putting in front of the buyer, strongest differentiator first. */
  highlightFacets: Array<{ label: string; value: string; reason: string }>;
  /** Which band to enter at, and why. Null when there is no cost to reason from. */
  priceApproach: { band: string; from: number | null; to: number | null; rationale: string } | null;
  /** Market words our own copy does not use yet. */
  keywordsToAdd: string[];
  /** What to watch in the first weeks, tied to what was actually measured. */
  metricsToWatch: Array<{ metric: string; why: string; reference: string }>;
  /** Things the data explicitly cannot tell us — printed so nobody assumes. */
  unknowns: string[];
};

const pct = (n: number | null) => (n == null ? "—" : `%${n}`);

export function buildSwot(args: {
  gapFindings: GapFinding[];
  market: MarketProfile;
  price: PriceStrategy;
  keywords: KeywordReport;
  costBasis: CostBasis;
}): Swot {
  const strengths: SwotItem[] = [];
  const weaknesses: SwotItem[] = [];
  const opportunities: SwotItem[] = [];
  const threats: SwotItem[] = [];

  // --- Strengths: features we have that the scanned market rarely states.
  for (const g of args.gapFindings) {
    if (g.band === "NOT_OBSERVED" || g.band === "RARE") {
      strengths.push({
        text: `${g.label}: ${g.ourValue}`,
        basis: g.scopeSentence,
        detail: { facetKey: g.facetKey, coveragePct: g.coveragePct, readableCount: g.readableCount },
      });
    }
  }

  // --- Weaknesses: what the same measurements say against us.
  for (const g of args.gapFindings) {
    if (g.band === "COMMON") {
      weaknesses.push({
        text: `${g.label} (${g.ourValue}) bir ayrışma noktası değil`,
        basis: g.scopeSentence,
        detail: { facetKey: g.facetKey, coveragePct: g.coveragePct },
      });
    }
  }
  if (args.market.rating && args.market.rating.medianReviewCount > 0) {
    weaknesses.push({
      text: "Yeni ilan — sosyal kanıt yok",
      basis: `Taranan ilanların yorum sayısı medyanı ${args.market.rating.medianReviewCount}, en yükseği ${args.market.rating.maxReviewCount}. Yeni bir ilan sıfırdan başlar.`,
      detail: { medianReviewCount: args.market.rating.medianReviewCount },
    });
  }
  if (args.costBasis.isAssumption) {
    weaknesses.push({
      text: "Maliyet ölçülmedi, varsayıldı",
      basis: args.costBasis.note,
    });
  }
  if (args.keywords.missingFromOurs.length > 0) {
    weaknesses.push({
      text: `Pazarın kullandığı ${args.keywords.missingFromOurs.length} kelime bizim metnimizde yok`,
      basis: `En sık geçenler: ${args.keywords.missingFromOurs.slice(0, 5).map((k) => k.display).join(", ")}.`,
      detail: { terms: args.keywords.missingFromOurs.map((k) => k.term) },
    });
  }

  // --- Opportunities: gaps plus thin price segments.
  for (const g of args.gapFindings) {
    if (g.opportunity === "HIGH" && g.otherValues.length > 0) {
      opportunities.push({
        text: `${g.label}: rakipler ağırlıklı olarak ${g.otherValues[0]!.value} (${pct(g.otherValues[0]!.pct)}) kullanıyor`,
        basis: g.scopeSentence,
        detail: { facetKey: g.facetKey, otherValues: g.otherValues },
      });
    }
  }
  const thin = args.market.segments.filter((s) => s.count > 0 && s.pct <= 15);
  for (const s of thin) {
    opportunities.push({
      text: `${s.label} (${s.from}–${s.to} ${args.market.currency}) seyrek: ${s.count} ilan`,
      basis: `Fiyatı okunabilen ${args.market.pricedCount} ilanın %${s.pct}'i bu bantta.`,
      detail: { segment: s },
    });
  }

  // --- Threats: concentration, entrenched reviews, and a market floor under
  //     our own break-even. The last one is the harshest and the most useful.
  if (args.market.sellerConcentrationPct != null && args.market.sellerConcentrationPct >= 50 && args.market.sellers.length >= 3) {
    threats.push({
      text: "Raf birkaç satıcıda yoğunlaşmış",
      basis: `En büyük üç satıcı, taranan ilanların %${args.market.sellerConcentrationPct}'ini elinde tutuyor.`,
      detail: { topSellers: args.market.sellers.slice(0, 3) },
    });
  }
  if (args.market.rating && args.market.rating.maxReviewCount >= 500) {
    threats.push({
      text: "Yerleşik, yüksek yorumlu rakipler var",
      basis: `Taranan ilanlarda en yüksek yorum sayısı ${args.market.rating.maxReviewCount}.`,
    });
  }
  if (args.price.status === "OK" && args.price.minProfitablePrice != null && args.market.priceStats) {
    const below = args.market.priceStats.min < args.price.minProfitablePrice;
    if (below) {
      const cheaper = args.market.priceStats;
      threats.push({
        text: "Başabaş fiyatımızın altında satan rakipler var",
        basis: `Pazarın en düşük gözlenen fiyatı ${cheaper.min} ${args.market.currency}; bizim başabaş fiyatımız ${args.price.minProfitablePrice} ${args.market.currency}.`,
        detail: { marketMin: cheaper.min, breakEven: args.price.minProfitablePrice },
      });
    }
  }

  const emptyQuadrants: string[] = [];
  if (strengths.length === 0) emptyQuadrants.push("Güçlü yönler");
  if (weaknesses.length === 0) emptyQuadrants.push("Zayıf yönler");
  if (opportunities.length === 0) emptyQuadrants.push("Fırsatlar");
  if (threats.length === 0) emptyQuadrants.push("Tehditler");

  return { strengths, weaknesses, opportunities, threats, emptyQuadrants };
}

export function buildLaunchSkeleton(args: {
  gapFindings: GapFinding[];
  market: MarketProfile;
  price: PriceStrategy;
  keywords: KeywordReport;
}): LaunchSkeleton {
  const highlightFacets = args.gapFindings
    .filter((g) => g.opportunity === "HIGH" || g.opportunity === "MEDIUM")
    .slice(0, 5)
    .map((g) => ({ label: g.label, value: g.ourValue, reason: g.scopeSentence }));

  let priceApproach: LaunchSkeleton["priceApproach"] = null;
  if (args.price.status === "OK") {
    const green = args.price.bands.find((b) => b.band === "GREEN") ?? null;
    const median = args.market.priceStats?.median ?? null;
    const target = args.price.targetPrice;
    const rationale =
      target != null && median != null
        ? target <= median
          ? `Hedef marj fiyatın (${target}) pazar medyanının (${median}) altında — marjdan ödün vermeden medyanın altında konumlanabilirsin.`
          : `Hedef marj fiyatın (${target}) pazar medyanının (${median}) üzerinde — ya farkı anlatan bir konumlandırma ya da daha düşük bir marj hedefi gerekiyor.`
        : target != null
          ? `Hedef marj fiyatı ${target}. Rakip fiyat verisi olmadığı için pazara göre konum belirlenemedi.`
          : "Hedef marj bu komisyon yapısıyla ulaşılamıyor; yalnızca başabaş fiyat üzerinden konumlanabilirsin.";
    priceApproach = { band: "GREEN", from: green?.from ?? null, to: green?.to ?? null, rationale };
  }

  const metricsToWatch: LaunchSkeleton["metricsToWatch"] = [];
  if (args.price.status === "OK" && args.price.minProfitablePrice != null) {
    metricsToWatch.push({
      metric: "Reklam sonrası birim kâr",
      why: "Reklam harcaması başabaş fiyatı yukarı kaydırır; ciro değil kâr takip edilmeli.",
      reference: `Reklamsız başabaş: ${args.price.minProfitablePrice} ${args.market.currency}`,
    });
  }
  if (args.market.rating && args.market.rating.medianReviewCount > 0) {
    metricsToWatch.push({
      metric: "Yorum kazanma hızı",
      why: "Sosyal kanıt açığı kapanmadan üst segmentte fiyat tutmak zor.",
      reference: `Pazar medyanı ${args.market.rating.medianReviewCount} yorum`,
    });
  }
  if (args.market.priceStats) {
    metricsToWatch.push({
      metric: "Fiyat konumu",
      why: "Rakipler fiyat düşürdüğünde bandın dışına çıkıp çıkmadığını görmek için.",
      reference: `Pazar aralığı ${args.market.priceStats.min}–${args.market.priceStats.max} ${args.market.currency}`,
    });
  }

  const unknowns: string[] = [
    "Satış adedi tahmini yapılmadı — bu veriyle tahmin edilemez.",
    "Arama hacmi ölçülmedi; kelime sıklıkları yalnızca rakip başlıklarından sayıldı.",
  ];
  if (!args.market.sufficient) unknowns.push("Örneklem pazar profili için yetersiz; oranlar yön gösterir, karar dayanağı değildir.");
  if (args.market.pricedCount === 0) unknowns.push("Hiçbir rakip fiyatı okunamadı; fiyat konumu belirlenemedi.");

  return {
    highlightFacets,
    priceApproach,
    keywordsToAdd: args.keywords.missingFromOurs.map((k) => k.display),
    metricsToWatch,
    unknowns,
  };
}

/** Turn the measurements into evidence rows. One conclusion, one reason, one
 *  provenance — the same contract ImportEvidence keeps. */
export function buildEvidence(args: {
  gapFindings: GapFinding[];
  market: MarketProfile;
  price: PriceStrategy;
  keywords: KeywordReport;
  swot: Swot;
}): PiEvidence[] {
  const out: PiEvidence[] = [];
  const add = (area: PiEvidence["area"], kind: string, polarity: Polarity, text: string, detail?: Record<string, unknown>) =>
    out.push({ area, kind, polarity, provenance: "CALCULATED", text, detail });

  for (const g of args.gapFindings) {
    add(
      "GAP",
      g.band,
      g.opportunity === "HIGH" ? "POSITIVE" : g.band === "COMMON" ? "NEGATIVE" : "NEUTRAL",
      `${g.headline} — ${g.scopeSentence}`,
      { facetKey: g.facetKey, readableCount: g.readableCount, matchCount: g.matchCount, coveragePct: g.coveragePct },
    );
  }

  if (args.market.priceStats) {
    const s = args.market.priceStats;
    add("MARKET", "PRICE_DISTRIBUTION", "NEUTRAL", `Fiyatı okunabilen ${s.count} ilan: en düşük ${s.min}, medyan ${s.median}, en yüksek ${s.max} ${args.market.currency}.`, { stats: s });
  }
  for (const note of args.market.notes) add("MARKET", "NOTE", "NEUTRAL", note);

  if (args.market.sellerConcentrationPct != null && args.market.sellers.length >= 3) {
    add("COMPETITOR", "SELLER_CONCENTRATION", args.market.sellerConcentrationPct >= 50 ? "NEGATIVE" : "NEUTRAL", `En büyük üç satıcı taranan ilanların %${args.market.sellerConcentrationPct}'ini tutuyor.`, { sellers: args.market.sellers.slice(0, 5) });
  }

  for (const k of args.keywords.missingFromOurs) {
    add("KEYWORD", "MISSING_TERM", "NEGATIVE", `"${k.display}" ilanların %${k.offerPct}'inde geçiyor (${k.sellerCount} farklı satıcı); bizim metnimizde yok.`, { term: k.term });
  }

  if (args.price.status === "OK") {
    add("PRICE", "COST_BASIS", args.price.costBasis.isAssumption ? "NEGATIVE" : "POSITIVE", `${args.price.costBasis.label}: birim ${args.price.costBasis.unitCost} ${args.price.costBasis.currency}. ${args.price.costBasis.note}`, { kind: args.price.costBasis.kind });
    add("PRICE", "BREAKEVEN", "NEUTRAL", `Başabaş fiyat ${args.price.minProfitablePrice} ${args.market.currency}; birim sabit maliyet ${args.price.fixedPerUnit}.`, { breakdown: args.price.breakdown });
  } else {
    add("PRICE", args.price.status, "NEGATIVE", args.price.costBasis.note);
  }
  for (const w of args.price.warnings) add("PRICE", "WARNING", "NEGATIVE", w);

  for (const q of args.swot.emptyQuadrants) add("SWOT", "EMPTY_QUADRANT", "NEUTRAL", `${q}: yeterli veri toplanamadı, boş bırakıldı.`);

  return out;
}
