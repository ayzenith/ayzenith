import "server-only";

import {
  DEFAULT_LEAD_WEIGHTS,
  priorityRoles,
  type LeadRole,
  type LeadScoreComponent,
  type LeadWeights,
} from "@/config/leads";
import type { LeadCandidate } from "./providers/types";

/**
 * AYZENITH LEAD FINDER — deterministic scoring engine (V2, §8/§9/§18).
 *
 * TWO separate numbers, on purpose:
 *   • leadScore     — commercial SUITABILITY (0–100), a weighted blend of the six
 *     V2 criteria (PRODUCT FIT, COMMERCIAL ROLE, COMPANY QUALITY, MARKET
 *     RELEVANCE, CONTACTABILITY, DATA CONFIDENCE). Computed ONLY over components
 *     with data, re-normalised by their weight — a missing component is NEVER
 *     silently counted as zero.
 *   • leadConfidence — how VERIFIED the underlying data is (0–100), independent of
 *     suitability. A firm can be a strong score with low confidence or vice versa.
 *
 * Pure functions of the inputs — no AI, no randomness. The AI layer (if any) only
 * ever explains these numbers; it never produces them.
 */

export type ScoreComponentResult = {
  key: LeadScoreComponent;
  weight: number;
  available: boolean;
  score: number | null;
  note: string;
};

export type ScoreResult = {
  leadScore: number | null;
  leadConfidence: number;
  measuredComponents: number;
  components: ScoreComponentResult[];
  /** True when a critical component (product fit) could not be measured — surfaced
   *  as "DATA LIMITED" next to the score (§9). */
  dataLimited: boolean;
};

export type ScoreInput = {
  candidate: LeadCandidate;
  roles: LeadRole[];
  size: "LARGE" | "MEDIUM" | "SMALL" | "MICRO" | "ONLINE" | "UNKNOWN";
  productFit: "VERIFIED" | "LIKELY" | "UNCLEAR" | "NOT_RELEVANT" | "UNVERIFIED";
  /** Model-fit for the searched model — the primary B2B/B2C gate (§1/§5). */
  modelFit: "VERIFIED" | "POSSIBLE" | "NOT_SUITABLE" | "UNVERIFIED";
  /** null = website not checked in this run (unknown, not penalised). */
  websiteStatus: "ACTIVE" | "UNREACHABLE" | "NONE" | null;
  businessModel: string;
  inTargetMarket: boolean;
  cityMatched: boolean | null;
  contactCount: number;
  /** Company-level email/phone present (from any source). */
  hasCompanyContact: boolean;
};

function roleFitScore(roles: LeadRole[], model: string): number {
  const priority = new Set(priorityRoles(model));
  if (roles.some((r) => priority.has(r) && r !== "other")) return 100;
  if (roles.some((r) => r !== "other")) return 65;
  return 40;
}

function sizeScore(size: ScoreInput["size"]): number | null {
  switch (size) {
    case "LARGE": return 100;
    case "MEDIUM": return 80;
    case "SMALL": return 60;
    case "ONLINE": return 60;
    case "MICRO": return 45;
    default: return null;
  }
}

function websiteScore(status: ScoreInput["websiteStatus"]): number {
  if (status == null) return 50; // not checked → neutral, never penalised
  return status === "ACTIVE" ? 100 : status === "UNREACHABLE" ? 40 : 20;
}

export function scoreCompany(input: ScoreInput, weights: LeadWeights = DEFAULT_LEAD_WEIGHTS): ScoreResult {
  const comps: ScoreComponentResult[] = [];

  // 1. PRODUCT FIT (30).
  const fit = input.productFit;
  if (fit === "UNVERIFIED") {
    comps.push({ key: "productFit", weight: weights.productFit, available: false, score: null, note: "Ürün uyumu doğrulanamadı (website taranmadı)." });
  } else {
    const s = fit === "VERIFIED" ? 100 : fit === "LIKELY" ? 75 : fit === "UNCLEAR" ? 50 : 5;
    comps.push({ key: "productFit", weight: weights.productFit, available: true, score: s, note: `Ürün uyumu: ${fit}.` });
  }

  // 2. COMMERCIAL ROLE / MODEL FIT (20) — the B2B/B2C gate (§1/§5). A firm that
  // does not fit the searched model scores near-zero here; a store that MIGHT buy
  // (POSSIBLE) is middling; unverified is modest (never a positive assumption).
  const modelScore =
    input.modelFit === "VERIFIED" ? 100
      : input.modelFit === "POSSIBLE" ? 55
        : input.modelFit === "NOT_SUITABLE" ? 10
          : 45; // UNVERIFIED
  // Blend with generic role fit so a clearly-relevant role still helps a little.
  const roleScore = Math.round(modelScore * 0.8 + roleFitScore(input.roles, input.businessModel) * 0.2);
  comps.push({
    key: "commercialRole",
    weight: weights.commercialRole,
    available: true,
    score: roleScore,
    note: `${input.businessModel} model uyumu: ${input.modelFit}.`,
  });

  // 3. COMPANY QUALITY (15) — website reachability + verified size.
  const web = websiteScore(input.websiteStatus);
  const sz = sizeScore(input.size);
  const quality = sz != null ? Math.round(web * 0.5 + sz * 0.5) : web;
  comps.push({
    key: "companyQuality",
    weight: weights.companyQuality,
    available: true,
    score: quality,
    note: sz != null ? "Website durumu + doğrulanmış ölçek." : "Website durumu (ölçek verisi yok).",
  });

  // 4. MARKET RELEVANCE (10) — verifiable location match.
  let marketScore = input.inTargetMarket ? 100 : 50;
  let marketNote = input.inTargetMarket ? "Hedef pazarda bulundu." : "Hedef pazar dışında olabilir.";
  if (input.cityMatched === false) { marketScore = 70; marketNote = "Belirtilen şehirle birebir eşleşmedi."; }
  comps.push({ key: "marketRelevance", weight: weights.marketRelevance, available: true, score: marketScore, note: marketNote });

  // 5. CONTACTABILITY (15) — decision-maker / contact reachability.
  let contactScore = 20;
  let contactNote = "Doğrudan iletişim bulunamadı.";
  if (input.contactCount > 0) { contactScore = 100; contactNote = `${input.contactCount} karar verici bulundu.`; }
  else if (input.hasCompanyContact) { contactScore = 70; contactNote = "Kurumsal iletişim bilgisi mevcut."; }
  else if (input.websiteStatus === "ACTIVE") { contactScore = 45; contactNote = "Aktif website üzerinden ulaşılabilir."; }
  comps.push({ key: "contactability", weight: weights.contactability, available: true, score: contactScore, note: contactNote });

  // 6. DATA CONFIDENCE (10) — how much is backed by real verification.
  let dq = 25;
  if (input.websiteStatus === "ACTIVE") dq += 25;
  if (input.candidate.address) dq += 15;
  if (fit === "VERIFIED") dq += 20; else if (fit === "LIKELY") dq += 10;
  if (input.contactCount > 0 || input.hasCompanyContact) dq += 10;
  dq = Math.min(100, dq);
  comps.push({ key: "dataConfidence", weight: weights.dataConfidence, available: true, score: dq, note: "Doğrulanmış veri oranı." });

  // Weighted score over AVAILABLE components only, re-normalised (no silent zero).
  const measured = comps.filter((c) => c.available && c.score != null);
  const measuredWeight = measured.reduce((a, c) => a + c.weight, 0);
  const leadScore =
    measuredWeight > 0
      ? Math.round(measured.reduce((a, c) => a + (c.score as number) * c.weight, 0) / measuredWeight)
      : null;

  // Confidence — verification depth (independent of suitability).
  let confidence = 20;
  if (input.websiteStatus === "ACTIVE") confidence += 25;
  if (input.candidate.address) confidence += 15;
  if (fit === "VERIFIED") confidence += 20; else if (fit === "LIKELY") confidence += 8;
  if (input.contactCount > 0) confidence += 15; else if (input.hasCompanyContact) confidence += 7;
  if (input.size !== "UNKNOWN") confidence += 5;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    leadScore,
    leadConfidence: confidence,
    measuredComponents: measured.length,
    components: comps,
    dataLimited: fit === "UNVERIFIED",
  };
}
