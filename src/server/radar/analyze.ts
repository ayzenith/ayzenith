import "server-only";

import {
  COUNTRY_LABELS,
  EU_DUTY_FREE_FOR_TR,
  weightsForModel,
  type RadarCategoryKey,
} from "@/config/radar";
import { getRadarSettings } from "./settings";
import { getVerifiedHsCodes } from "./hs";
import { computeScore, decideBand, type ScoringInput } from "./scoring";
import type { Citation, CountryValue } from "./providers/types";
import {
  getImportSeries,
  getImportsForCountries,
  getImportSources,
  getSubcategorySeries,
  getTrExportsByHsToCountry,
  getTrExportsToCountries,
} from "./providers/comtrade";
import { getAppliedTariff } from "./providers/wits";
import { getEuImport } from "./providers/eurostat";

/**
 * AYZENITH RADAR — analysis orchestrator (the pipeline).
 *
 * DATA → SCORING. It resolves the category to VERIFIED HS codes, pulls the
 * required trade data from the providers (Comtrade primary, Eurostat fallback,
 * WITS for tariffs), assembles the deterministic scoring input and returns a
 * complete result — but writes NOTHING and calls NO AI. Snapshotting and AI
 * interpretation are separate downstream steps, preserving the strict layering.
 *
 * Honesty guarantees enforced here:
 *  • Only VERIFIED HS codes are used.
 *  • If the critical demand data can't be fetched, the result is INSUFFICIENT
 *    DATA (no score) — never a guess.
 *  • Every provider error is recorded in `errors` and surfaced, never masked.
 */

export type AnalyzeParams = {
  categoryKey: RadarCategoryKey | string;
  countryCode: string; // ISO alpha-2 for country scope
  geoScope?: "country" | "region";
  supplyMarket?: string; // "TR"
  tradeModel?: string; // "B2B"
  /** "category" (whole verified HS set) or "product" (one confirmed HS-6). */
  analysisType?: "category" | "product";
  /** Natural-language product name — product scope only (display + snapshot). */
  productName?: string;
  /** The single HS-6 to analyse — product scope only. MUST be a VERIFIED code
   *  for the category; an unverified/AI-suggested code is never analysed. */
  hsCode?: string;
};

export type SubCategory = {
  hs6: string;
  productGroup: string;
  /** Composite product-opportunity score (size + growth + TR fit). */
  score: number;
  trendPct: number | null;
  latest: number;
  /** Turkey → target export for THIS product (USD), or null if unavailable. */
  trToTarget: number | null;
  /** Turkey's share of this product's imports (%), or null. */
  trSharePct: number | null;
};

export type AnalysisResult = {
  categoryKey: string;
  countryCode: string;
  countryLabel: string;
  geoScope: "country" | "region";
  supplyMarket: string;
  tradeModel: string;
  analysisType: "category" | "product";
  productName: string | null;
  hsCode: string | null;
  latestYear: number | null;
  resolvedHs: Array<{ hs6: string; productGroup: string }>;
  criteria: ReturnType<typeof computeScore>["criteria"];
  finalScore: number | null;
  decision: "WORTH_RESEARCHING" | "MONITOR" | "NOT_PRIORITY" | "INSUFFICIENT_DATA";
  confidence: number;
  measuredCriteria: number;
  weightsUsed: Record<string, number>;
  subCategories: SubCategory[];
  citations: Citation[];
  errors: string[];
};

/** Newest trade year that Comtrade is likely to have complete annual data for. */
function defaultYearWindow(): { years: number[]; latest: number } {
  const latest = new Date().getFullYear() - 2; // annual data lags ~1.5y
  return { years: [latest - 3, latest - 2, latest - 1, latest], latest };
}

function pickValue(list: CountryValue[], iso: string): number | null {
  const found = list.find((c) => c.countryCode.toUpperCase() === iso.toUpperCase());
  return found ? found.value : null;
}

/** Fixed growth rubric (mirrors the engine) for sub-category trend scoring. */
function growthRubric(cagr: number | null): number {
  if (cagr == null) return 50;
  if (cagr > 15) return 100;
  if (cagr >= 8) return 80;
  if (cagr >= 3) return 60;
  if (cagr >= 0) return 40;
  return Math.max(0, 20 + cagr);
}

export async function analyzeMarket(params: AnalyzeParams): Promise<AnalysisResult> {
  const geoScope = params.geoScope ?? "country";
  const supplyMarket = params.supplyMarket ?? "TR";
  const tradeModel = params.tradeModel ?? "B2B";
  const analysisType = params.analysisType === "product" ? "product" : "category";
  const countryCode = params.countryCode.toUpperCase();
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode;

  const settings = await getRadarSettings();
  // V1.1: the business model chooses the weight profile (B2B = owner-configured,
  // B2C = fixed consumer profile). Both use the SAME five verified criteria.
  const weights = weightsForModel(tradeModel, settings.weights);
  const errors: string[] = [];
  const citations: Citation[] = [];

  // 1. Resolve VERIFIED HS codes. For a PRODUCT-scope analysis, narrow to the one
  //    confirmed HS-6 — but ONLY if it is a VERIFIED code for this category. An
  //    AI-suggested / unverified code is never analysed (the core honesty rule).
  let resolvedHs = await getVerifiedHsCodes(params.categoryKey);
  let productName: string | null = null;
  let hsCode: string | null = null;
  if (analysisType === "product") {
    const wanted = (params.hsCode ?? "").trim();
    const found = resolvedHs.find((h) => h.hs6 === wanted);
    if (!wanted || !found) {
      errors.push(
        `Seçilen ürün HS kodu (${wanted || "belirtilmedi"}) bu kategoride doğrulanmış değil — analiz yapılamaz. Önce HS Eşlemeleri'nden ekleyip doğrulayın.`,
      );
      resolvedHs = [];
    } else {
      productName = params.productName?.trim() || found.productGroup;
      hsCode = found.hs6;
      resolvedHs = [{ hs6: found.hs6, productGroup: productName }];
    }
  }
  const hsCodes = resolvedHs.map((h) => h.hs6);

  const baseResult: AnalysisResult = {
    categoryKey: params.categoryKey,
    countryCode,
    countryLabel,
    geoScope,
    supplyMarket,
    tradeModel,
    analysisType,
    productName,
    hsCode,
    latestYear: null,
    resolvedHs,
    criteria: [],
    finalScore: null,
    decision: "INSUFFICIENT_DATA",
    confidence: 0,
    measuredCriteria: 0,
    weightsUsed: weights,
    subCategories: [],
    citations,
    errors,
  };

  if (hsCodes.length === 0) {
    errors.push(
      `"${params.categoryKey}" kategorisi için doğrulanmış HS kodu yok — analiz yapılamaz.`,
    );
    return baseResult;
  }

  // 2. Peer basket: the region the country belongs to (or the region itself).
  const regionForCountry =
    Object.values(settings.regions).find((r) => r.countries.includes(countryCode)) ??
    settings.regions.europe;
  // Cap the peer basket for a single-country analysis: min–max normalisation
  // needs a representative set, not every market, and each peer costs
  // (peers × HS codes) live calls. A region-scope analysis widens this later.
  const PEER_CAP = 8;
  const peers = (regionForCountry?.countries ?? [countryCode])
    .map((c) => c.toUpperCase())
    .slice(0, PEER_CAP);
  const peerSet = Array.from(new Set([countryCode, ...peers]));

  // 3. CRITICAL: target import series (demand + growth). Failure ⇒ insufficient.
  const seriesRes = await getImportSeries(countryCode, hsCodes, defaultYearWindow().years);
  let targetImport: number | null = null;
  let growthCagr: number | null = null;
  let growthYears = 0;
  let latestYear: number | null = null;

  if (seriesRes.ok) {
    citations.push(...seriesRes.citations);
    targetImport = seriesRes.value.latestValue;
    growthCagr = seriesRes.value.growthCagr;
    growthYears = seriesRes.value.growthYears;
    latestYear = seriesRes.value.latestYear;
    if (seriesRes.warning) errors.push(seriesRes.warning);
  } else {
    errors.push(seriesRes.error);
    // Eurostat fallback for EU members (demand only; no growth series).
    if (EU_DUTY_FREE_FOR_TR.has(countryCode)) {
      const { latest } = defaultYearWindow();
      const euRes = await getEuImport(countryCode, hsCodes, latest);
      if (euRes.ok) {
        citations.push(...euRes.citations);
        targetImport = euRes.value.value;
        latestYear = euRes.value.year;
      } else {
        errors.push(euRes.error);
      }
    }
  }

  if (targetImport == null || latestYear == null) {
    errors.push("Kritik ithalat verisi bulunamadı; skor üretilmedi.");
    return { ...baseResult, latestYear };
  }
  baseResult.latestYear = latestYear;

  // 4. Fetch the remaining signals in parallel at the resolved latest year.
  const [peerRes, trRes, sourceRes, subRes, trByHsRes] = await Promise.all([
    getImportsForCountries(peerSet, hsCodes, latestYear, latestYear - 1),
    getTrExportsToCountries(peerSet, hsCodes, latestYear, latestYear - 1),
    getImportSources(countryCode, hsCodes, latestYear),
    getSubcategorySeries(countryCode, hsCodes, defaultYearWindow().years, latestYear),
    getTrExportsByHsToCountry(countryCode, hsCodes, latestYear, latestYear - 1),
  ]);
  const trByHs: Record<string, number> = trByHsRes.ok ? trByHsRes.value : {};
  if (trByHsRes.ok) {
    citations.push(...trByHsRes.citations);
    if (trByHsRes.warning) errors.push(trByHsRes.warning);
  }

  let peerImports: number[] = [];
  if (peerRes.ok) {
    citations.push(...peerRes.citations);
    peerImports = peerRes.value.map((c) => c.value);
    if (peerRes.warning) errors.push(peerRes.warning);
  } else {
    errors.push(peerRes.error);
    peerImports = [targetImport]; // degrade: at least the target itself
  }

  let trToTargetExport: number | null = null;
  let trToPeerExports: number[] = [];
  if (trRes.ok) {
    citations.push(...trRes.citations);
    trToTargetExport = pickValue(trRes.value, countryCode);
    trToPeerExports = trRes.value.map((c) => c.value);
    if (trRes.warning) errors.push(trRes.warning);
  } else {
    errors.push(trRes.error);
  }

  let sourceCountryImports: number[] = [];
  let sourceBreakdown: CountryValue[] = [];
  if (sourceRes.ok) {
    citations.push(...sourceRes.citations);
    sourceBreakdown = sourceRes.value;
    sourceCountryImports = sourceRes.value.map((c) => c.value);
    if (sourceRes.warning) errors.push(sourceRes.warning);
  } else {
    errors.push(sourceRes.error);
  }

  // 5. Tariff: EU Customs Union ⇒ 0% for TR industrial goods (a real fact, not a
  //    guess). Non-EU ⇒ best-effort WITS; null if unavailable.
  const euDutyFree = EU_DUTY_FREE_FOR_TR.has(countryCode);
  let customsDutyPct: number | null = null;
  if (euDutyFree) {
    customsDutyPct = 0;
  } else {
    const tariffRes = await getAppliedTariff(countryCode, hsCodes, latestYear);
    if (tariffRes.ok) {
      citations.push(...tariffRes.citations);
      customsDutyPct = tariffRes.value;
    } else {
      errors.push(tariffRes.error);
    }
  }

  const certificationBurden = settings.certificationBurden[params.categoryKey] ?? "medium";

  // 6. Deterministic scoring.
  const input: ScoringInput = {
    targetImport,
    peerImports,
    growthCagr,
    growthYears,
    trToTargetExport,
    trToPeerExports,
    euDutyFree,
    customsDutyPct,
    certificationBurden,
    sourceCountryImports,
  };
  const outcome = computeScore(input, weights);
  const decision = outcome.insufficient
    ? "INSUFFICIENT_DATA"
    : decideBand(outcome.finalScore as number, settings.thresholds);

  // Attach the top source countries (codes + share) to the competition criterion
  // so the snapshot freezes WHO the suppliers are, not just how many. Deterministic.
  if (sourceBreakdown.length > 0) {
    const totalSrc = sourceBreakdown.reduce((a, c) => a + c.value, 0);
    const topSources = [...sourceBreakdown]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((c) => ({
        cc: c.countryCode,
        value: c.value,
        sharePct: totalSrc > 0 ? Number(((c.value / totalSrc) * 100).toFixed(1)) : 0,
      }));
    const compCriterion = outcome.criteria.find((c) => c.key === "competition");
    if (compCriterion) compCriterion.rawInputs.topSources = topSources;
  }

  // 7. Sub-category breakdown (real HS-6 data → per-code score).
  let subCategories: SubCategory[] = [];
  if (subRes.ok) {
    if (subRes.warning) errors.push(subRes.warning);
    const values = subRes.value.map((s) => s.latest);
    const min = Math.min(...values);
    const max = Math.max(...values);
    subCategories = subRes.value
      .map((s) => {
        const sizeScore =
          max === min ? 50 : ((s.latest - min) / (max - min)) * 100;
        // Product-level Turkey fit: proven channel + growth headroom (low share).
        const trToTarget = trByHs[s.hs6] ?? null;
        let trSharePct: number | null = null;
        if (trToTarget != null && s.latest > 0) {
          trSharePct = Number(((trToTarget / s.latest) * 100).toFixed(2));
        }
        let trFit = 50; // unknown → neutral
        if (trToTarget != null) {
          if (trToTarget <= 0) trFit = 45; // no channel yet
          else {
            const share = Math.min(trSharePct ?? 0, 100);
            trFit = 55 + (share < 15 ? 20 : share < 40 ? 10 : 0);
          }
        }
        // Composite opportunity: size 45% + growth 35% + TR fit 20% — NOT size alone.
        const score = Math.round(
          sizeScore * 0.45 + growthRubric(s.cagrPct) * 0.35 + trFit * 0.2,
        );
        const group = resolvedHs.find((h) => h.hs6 === s.hs6)?.productGroup ?? s.hs6;
        return {
          hs6: s.hs6,
          productGroup: group,
          score,
          trendPct: s.cagrPct == null ? null : Number(s.cagrPct.toFixed(1)),
          latest: s.latest,
          trToTarget,
          trSharePct,
        };
      })
      .sort((a, b) => b.score - a.score);
  } else {
    errors.push(subRes.error);
  }

  return {
    ...baseResult,
    latestYear,
    criteria: outcome.criteria,
    finalScore: outcome.finalScore,
    decision,
    confidence: outcome.confidence,
    measuredCriteria: outcome.measuredCriteria,
    weightsUsed: weights,
    subCategories,
    citations,
    errors,
  };
}
