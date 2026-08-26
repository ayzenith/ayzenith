/**
 * AYZENITH RADAR — deterministic scoring engine.
 *
 * PURE FUNCTIONS ONLY. No I/O, no database, no AI, no randomness. Given a fully
 * assembled set of raw numeric inputs, it returns the five criterion scores and
 * the final weighted score — the same inputs always yield the same output. This
 * is the module that guarantees "the score is computed 100% in code; the AI
 * never produces a score". The AI layer is downstream and only ever reads the
 * result of this file.
 *
 * Normalisation philosophy: a raw trade figure is meaningless alone ("is 5bn$
 * big?"), so most criteria are scored RELATIVELY against a peer basket. The
 * orchestrator supplies the peers; this file only does the maths.
 */

import {
  ANOMALY_CAGR_PCT,
  CERTIFICATION_PENALTY,
  type CertificationBurden,
  type RadarCriterionKey,
  type RadarThresholds,
  type RadarWeights,
} from "@/config/radar";

/** A single raw-input value. Mostly scalar, but a few criteria attach a small
 *  structured breakdown (e.g. top source countries) — always JSON-serialisable
 *  so it freezes cleanly into the snapshot. */
export type RawValue =
  | number
  | string
  | boolean
  | null
  | Array<{ cc: string; value: number; sharePct: number }>;

// ----------------------------------------------------------------------------
// Inputs — assembled by the orchestrator from provider data. A `null` field
// means "data unavailable for this signal" and the criterion degrades honestly
// rather than inventing a value.
// ----------------------------------------------------------------------------

export type ScoringInput = {
  /** Target country's total import value for the HS set, latest year (USD). */
  targetImport: number | null;
  /** Import values of every peer country (incl. target) for the same HS set,
   *  latest year (USD) — the basket demand is normalised against. */
  peerImports: number[];
  /** Pre-computed value-weighted growth CAGR (%) for the basket, or null. */
  growthCagr: number | null;
  /** Number of years the growth CAGR spans, for reporting. */
  growthYears: number;
  /** Turkey → target exports for the HS set, latest year (USD). */
  trToTargetExport: number | null;
  /** Turkey → each peer exports, latest year (USD) — basket for supply strength. */
  trToPeerExports: number[];
  /** Whether Turkish industrial goods enter this market duty-free (EU CU/FTA). */
  euDutyFree: boolean;
  /** Applied customs duty % on TR-origin goods (0–100). null = unknown. */
  customsDutyPct: number | null;
  /** Curated certification burden for the category. */
  certificationBurden: CertificationBurden;
  /** Import value by source country for the target market (USD) — for
   *  concentration / competition. Empty = unknown. */
  sourceCountryImports: number[];
  /** How many of the INTENDED peer basket actually returned real data, vs how
   *  many were meant to be measured. A country that genuinely reported zero
   *  trade still counts as "measured" here — this is specifically about
   *  provider failures (network/throttling), not empty results. null/omitted
   *  when the caller didn't track it → treated as full coverage, never as a
   *  penalty for a caller simply not reporting it. */
  peerCoverage?: { measured: number; expected: number } | null;
  /** Same idea for the Turkey→peer export basket that supplyAdvantage uses. */
  trPeerCoverage?: { measured: number; expected: number } | null;
};

export type CriterionResult = {
  key: RadarCriterionKey;
  /** 0–100, or null when the underlying data was unavailable. */
  score: number | null;
  available: boolean;
  /** Raw numbers that produced the score, for transparency + citations. */
  rawInputs: Record<string, RawValue>;
  /** Plain-language Turkish note on how it was derived (no AI — templated). */
  explanation: string;
  /** 0–1: how COMPLETE the data behind an available score is — distinct from
   *  `available`, which is binary. A criterion can be available (a score was
   *  produced) from 1 of 8 intended peer markets and from 8 of 8; both used to
   *  report the exact same confidence credit. This is what lets `computeScore`
   *  tell those apart. 1 when the criterion has no such notion (e.g. entry's
   *  certification table, always fully known) or the caller didn't track it. */
  completeness: number;
};

export type ScoreOutcome = {
  criteria: CriterionResult[];
  /** null when critical data (demand) is missing → INSUFFICIENT_DATA upstream. */
  finalScore: number | null;
  /** How many of the five criteria had usable data. */
  measuredCriteria: number;
  /** 0–100: weighted share of the total weight backed by real data. */
  confidence: number;
  /** true when the demand criterion itself could not be computed. */
  insufficient: boolean;
};

// ----------------------------------------------------------------------------
// Small numeric helpers
// ----------------------------------------------------------------------------

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Min–max normalise `value` within `basket` → 0..100. If the basket has no
 *  spread (all equal) the value maps to the midpoint 50. */
function minMax(value: number, basket: number[]): number {
  const vals = basket.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return 50;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (hi === lo) return 50;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

/** Herfindahl concentration (0..1) of a set of import values. Higher = more
 *  dominated by few source countries. */
function herfindahl(values: number[]): number | null {
  const vals = values.filter((v) => Number.isFinite(v) && v > 0);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return vals.reduce((acc, v) => acc + Math.pow(v / total, 2), 0);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} mrd$`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} mn$`;
  return `${Math.round(n)}$`;
}

// ----------------------------------------------------------------------------
// Criterion 1 — Demand & market size (relative import volume). CRITICAL.
// ----------------------------------------------------------------------------

function scoreDemand(input: ScoringInput): CriterionResult {
  const { targetImport, peerImports, peerCoverage } = input;
  if (targetImport == null || peerImports.length === 0) {
    return {
      key: "demand",
      score: null,
      available: false,
      rawInputs: { targetImport: targetImport ?? null },
      explanation: "İthalat hacmi verisi bulunamadı.",
      completeness: 0,
    };
  }
  const score = round(minMax(targetImport, peerImports));
  const completeness =
    peerCoverage && peerCoverage.expected > 0
      ? clamp(peerCoverage.measured / peerCoverage.expected, 0, 1)
      : 1;
  return {
    key: "demand",
    score,
    available: true,
    rawInputs: {
      targetImport,
      peerCount: peerImports.length,
      peerExpected: peerCoverage?.expected ?? null,
    },
    explanation:
      completeness < 1
        ? `Hedef pazarın ithalatı ${fmtUsd(targetImport)}; ${peerCoverage!.measured}/${peerCoverage!.expected} kıyas pazarı ölçülebildi (göreceli konum ${score}/100 — kısmi veri, güven buna göre düşürüldü).`
        : `Hedef pazarın ithalatı ${fmtUsd(
            targetImport,
          )}; ${peerImports.length} benzer pazar arasında göreceli konum ${score}/100.`,
    completeness,
  };
}

// ----------------------------------------------------------------------------
// Criterion 2 — Growth trend (CAGR against a fixed rubric, not peers).
// ----------------------------------------------------------------------------

/** The intended trend window (mirrors `defaultYearWindow()` in analyze.ts —
 *  four years of annual data). Fewer actual years is objectively a thinner
 *  trend read, not a different one; this only affects confidence, never the
 *  fixed growth rubric itself. */
const EXPECTED_GROWTH_YEARS = 4;

function scoreGrowth(input: ScoringInput): CriterionResult {
  const cagr = input.growthCagr;
  if (cagr == null) {
    return {
      key: "growth",
      score: null,
      available: false,
      rawInputs: { years: input.growthYears },
      explanation: "Büyüme trendi için yeterli yıllık veri yok (en az 2 yıl).",
      completeness: 0,
    };
  }
  // Fixed rubric: growth is a universal question, not peer-relative.
  let score: number;
  if (cagr > 15) score = 100;
  else if (cagr >= 8) score = 80;
  else if (cagr >= 3) score = 60;
  else if (cagr >= 0) score = 40;
  else score = clamp(20 + cagr, 0, 20); // shrinking → 0–20
  const anomaly = Math.abs(cagr) >= ANOMALY_CAGR_PCT;
  const completeness = clamp(input.growthYears / EXPECTED_GROWTH_YEARS, 0, 1);
  return {
    key: "growth",
    score: round(score),
    available: true,
    rawInputs: { cagrPct: Number(cagr.toFixed(1)), years: input.growthYears, anomaly },
    explanation: `Son ${input.growthYears} yılda yıllık ortalama ithalat değişimi %${cagr.toFixed(
      1,
    )} (ürün bazlı, değer ağırlıklı).`,
    completeness,
  };
}

// ----------------------------------------------------------------------------
// Criterion 3 — Turkey supply advantage. Two sub-signals: proven trade route
// (3a, 60%) + growth headroom via low TR share (3b, 40%) + EU duty-free bonus.
// ----------------------------------------------------------------------------

function scoreSupplyAdvantage(input: ScoringInput): CriterionResult {
  const { trToTargetExport, trToPeerExports, targetImport, euDutyFree, trPeerCoverage } = input;
  if (trToTargetExport == null || trToPeerExports.length === 0) {
    return {
      key: "supplyAdvantage",
      score: null,
      available: false,
      rawInputs: { trToTargetExport: trToTargetExport ?? null },
      explanation: "Türkiye ihracat verisi bulunamadı.",
      completeness: 0,
    };
  }
  // 3a — proven trade strength, normalised across peers.
  const strength = minMax(trToTargetExport, trToPeerExports);

  // 3b — headroom: a SMALL current TR share of a real market = room to grow.
  let headroom = 50;
  let trSharePct: number | null = null;
  if (targetImport != null && targetImport > 0) {
    trSharePct = (trToTargetExport / targetImport) * 100;
    // Invert: tiny share → high headroom; large share → saturated.
    headroom = clamp(100 - Math.min(trSharePct, 100));
  }

  let score = strength * 0.6 + headroom * 0.4;
  if (euDutyFree) score = clamp(score + 8); // real, measurable CU advantage

  const completeness =
    trPeerCoverage && trPeerCoverage.expected > 0
      ? clamp(trPeerCoverage.measured / trPeerCoverage.expected, 0, 1)
      : 1;

  return {
    key: "supplyAdvantage",
    score: round(score),
    available: true,
    rawInputs: {
      trToTargetExport,
      trSharePct: trSharePct == null ? null : Number(trSharePct.toFixed(2)),
      euDutyFree,
      trPeerExpected: trPeerCoverage?.expected ?? null,
    },
    explanation:
      completeness < 1
        ? `Türkiye bu pazara ${fmtUsd(trToTargetExport)} ihracat yapıyor${
            trSharePct != null ? ` (pazar payı %${trSharePct.toFixed(1)})` : ""
          }; kıyas sepetinin yalnızca ${trPeerCoverage!.measured}/${trPeerCoverage!.expected} pazarı ölçülebildi (güven buna göre düşürüldü).`
        : `Türkiye bu pazara ${fmtUsd(trToTargetExport)} ihracat yapıyor${
            trSharePct != null ? ` (pazar payı %${trSharePct.toFixed(1)})` : ""
          }${euDutyFree ? "; Gümrük Birliği ile sanayi malları vergisiz." : "."}`,
    completeness,
  };
}

// ----------------------------------------------------------------------------
// Criterion 4 — Entry ease (INVERSE). Customs duty + certification burden.
// ----------------------------------------------------------------------------

function scoreEntry(input: ScoringInput): CriterionResult {
  const { customsDutyPct, certificationBurden } = input;
  const certPenalty = CERTIFICATION_PENALTY[certificationBurden]; // 0..1

  // Duty penalty: 0% → 0 penalty; ≥20% → full penalty.
  const dutyKnown = customsDutyPct != null;
  const dutyPenalty = dutyKnown ? clamp((customsDutyPct as number) / 20, 0, 1) : 0.4;

  // Combine: certification weighted 0.6, duty 0.4. Ease = 100 - penalties.
  const penalty = certPenalty * 0.6 + dutyPenalty * 0.4;
  const score = round(clamp(100 - penalty * 100));

  return {
    key: "entry",
    score,
    // Certification burden is always known (curated table); duty may be assumed.
    available: true,
    rawInputs: {
      customsDutyPct: customsDutyPct ?? null,
      certificationBurden,
      dutyAssumed: !dutyKnown,
    },
    explanation: `Sertifikasyon yükü: ${certificationBurden}${
      dutyKnown
        ? `; TR menşeli mal gümrük vergisi %${customsDutyPct}.`
        : "; gümrük vergisi verisi bulunamadı (varsayılan kullanıldı)."
    }`,
    // Certification is always curated (fully known); duty is the only part of
    // this criterion that can be a guess, so completeness only degrades for that.
    completeness: dutyKnown ? 1 : 0.7,
  };
}

// ----------------------------------------------------------------------------
// Criterion 5 — Competition headroom (INVERSE of source concentration).
// ----------------------------------------------------------------------------

function scoreCompetition(input: ScoringInput): CriterionResult {
  const hhi = herfindahl(input.sourceCountryImports);
  if (hhi == null) {
    return {
      key: "competition",
      score: null,
      available: false,
      rawInputs: { sources: input.sourceCountryImports.length },
      explanation: "Kaynak ülke kırılımı verisi bulunamadı.",
      completeness: 0,
    };
  }
  // Low concentration (dispersed suppliers) → easy to enter → high score.
  // HHI ranges ~1/n (dispersed) → 1 (monopoly). Invert to 0..100.
  const score = round(clamp((1 - hhi) * 100));
  return {
    key: "competition",
    score,
    available: true,
    rawInputs: { concentrationHhi: Number(hhi.toFixed(3)), sources: input.sourceCountryImports.length },
    explanation: `İthalat ${input.sourceCountryImports.length} kaynak ülkeye dağılmış; yoğunlaşma endeksi ${hhi.toFixed(
      2,
    )} (düşük = tedarik daha dağınık, tek ülke baskın değil).`,
    // No fixed "expected source count" exists to compare against (unlike the
    // peer baskets above) — whatever breakdown Comtrade returned is all there
    // is to measure with, so this is left at full completeness.
    completeness: 1,
  };
}

// ----------------------------------------------------------------------------
// Aggregate
// ----------------------------------------------------------------------------

/**
 * Compute the full outcome. If `demand` (the critical criterion) has no data the
 * result is flagged `insufficient` and `finalScore` is null — the system says
 * "I don't know" instead of guessing. Otherwise the final score is the weighted
 * average over ONLY the available criteria, re-normalised by their weight so a
 * missing minor criterion doesn't unfairly drag the total. Confidence reports
 * how much of the total weight was actually backed by data.
 */
export function computeScore(
  input: ScoringInput,
  weights: RadarWeights,
): ScoreOutcome {
  const criteria: CriterionResult[] = [
    scoreDemand(input),
    scoreGrowth(input),
    scoreSupplyAdvantage(input),
    scoreEntry(input),
    scoreCompetition(input),
  ];

  const demand = criteria.find((c) => c.key === "demand")!;
  const measuredCriteria = criteria.filter((c) => c.available).length;

  // Confidence = share of total weight covered by available criteria, scaled by
  // how COMPLETE each one's underlying data actually was. A criterion available
  // from 1 of 8 intended peer markets used to earn the exact same confidence
  // credit as one available from 8 of 8 — this is what stops a partial-outage
  // snapshot from reading as cleanly as a fully-measured one (§ audit finding).
  // The SCORE itself is untouched: finalScore below still re-normalises over
  // full criterion weight, so this only ever affects the confidence number.
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const confidenceWeight = criteria
    .filter((c) => c.available)
    .reduce((acc, c) => acc + weights[c.key] * c.completeness, 0);
  const confidence = round((confidenceWeight / totalWeight) * 100);

  if (!demand.available) {
    return { criteria, finalScore: null, measuredCriteria, confidence, insufficient: true };
  }

  // Weighted average over available criteria, re-normalised by AVAILABLE
  // weight (not completeness-scaled) — the score itself never changes based on
  // how thin the data behind it was, only the confidence number does.
  const coveredWeight = criteria
    .filter((c) => c.available)
    .reduce((acc, c) => acc + weights[c.key], 0);
  const weightedSum = criteria
    .filter((c) => c.available && c.score != null)
    .reduce((acc, c) => acc + (c.score as number) * weights[c.key], 0);
  const finalScore = round(weightedSum / coveredWeight);

  return { criteria, finalScore, measuredCriteria, confidence, insufficient: false };
}

/** Map a final score to its decision band. Never called with a null score. */
export function decideBand(
  score: number,
  thresholds: RadarThresholds,
): "WORTH_RESEARCHING" | "MONITOR" | "NOT_PRIORITY" {
  if (score >= thresholds.worth) return "WORTH_RESEARCHING";
  if (score >= thresholds.monitor) return "MONITOR";
  return "NOT_PRIORITY";
}
