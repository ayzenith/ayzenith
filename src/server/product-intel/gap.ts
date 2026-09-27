/**
 * PRODUCT INTELLIGENCE — product gaps (pure: no DB, no network).
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 *
 * A coverage figure is divided by the offers whose text ACTUALLY STATED the
 * facet — never by the number of offers scanned. If 62 listings were read and
 * only 41 said anything about their connector, the denominator is 41. Dividing
 * by 62 would count "the listing did not mention it" as "the product does not
 * have it", and the module would then confidently report a market gap that is
 * really a gap in our reading.
 *
 * This is the same mistake RADAR's prompt spends a paragraph forbidding
 * ("VERI YOK != DUSUK DEGER") and the one Lead Finder found in its own
 * UNREACHABLE counts. Here it is arithmetic rather than instruction, so it
 * cannot be talked out of.
 *
 * Nothing in this file may produce the words "the market does not have this".
 * The strongest statement available is "not observed within what we scanned",
 * and every finding carries the sentence that says how much that was.
 */

import { MIN_FACET_SAMPLE } from "@/config/product-intel";
import { FACET_DEFS, facetDef, type Facet, type FacetKind } from "./facets";

export type GapBand = "NOT_OBSERVED" | "RARE" | "MINORITY" | "COMMON" | "INSUFFICIENT_DATA";

export const GAP_BAND_LABELS: Record<GapBand, string> = {
  NOT_OBSERVED: "Taranan kapsamda gözlenmedi",
  RARE: "Nadir",
  MINORITY: "Azınlıkta",
  COMMON: "Yaygın",
  INSUFFICIENT_DATA: "Veri yetersiz",
};

/** How strong an opportunity the band implies. Only the first two are ones the
 *  launch plan is allowed to lean on. */
export const GAP_BAND_OPPORTUNITY: Record<GapBand, "HIGH" | "MEDIUM" | "LOW" | "NONE"> = {
  NOT_OBSERVED: "HIGH",
  RARE: "HIGH",
  MINORITY: "MEDIUM",
  COMMON: "LOW",
  INSUFFICIENT_DATA: "NONE",
};

export type ValueCount = { value: string; count: number; pct: number };

export type GapFinding = {
  facetKey: string;
  label: string;
  kind: FacetKind;
  unit?: string;
  ourValue: string;
  ourNum?: number;

  /** Offers taken into account at all (excluded ones already removed). */
  totalOffers: number;
  /** Offers whose text discussed the facet, parseable or not. Diagnostic only:
   *  the distance between this and `readableCount` is how much our reader is
   *  losing, and it is shown so the number can be distrusted honestly. */
  mentionedCount: number;
  /** THE DENOMINATOR. Offers where a value was actually read. */
  readableCount: number;
  /** Offers that match us (same value, or at least our number). */
  matchCount: number;
  coveragePct: number | null;

  band: GapBand;
  opportunity: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  /** What the rivals use instead — this is what makes a gap actionable. */
  otherValues: ValueCount[];
  /** Must accompany the finding everywhere it is shown or fed to the AI. */
  scopeSentence: string;
  headline: string;
  matchedRanks: number[];
};

export type GapInput = {
  ourFacets: Facet[];
  offers: Array<{ rank: number; normalized: string }>;
  /** Override for tests; defaults to the configured minimum. */
  minSample?: number;
};

function band(readableCount: number, matchCount: number, minSample: number): GapBand {
  if (readableCount < minSample) return "INSUFFICIENT_DATA";
  if (matchCount === 0) return "NOT_OBSERVED";
  const pct = (matchCount / readableCount) * 100;
  if (pct <= 15) return "RARE";
  if (pct <= 50) return "MINORITY";
  return "COMMON";
}

function matches(kind: FacetKind, ours: Facet, theirValue: string, theirNum: number | undefined): boolean {
  if (kind === "NUMERIC_HIGHER_BETTER") {
    if (ours.num == null || theirNum == null) return false;
    return theirNum >= ours.num;
  }
  return theirValue === ours.value;
}

export function computeGapFindings(input: GapInput): GapFinding[] {
  const minSample = input.minSample ?? MIN_FACET_SAMPLE;
  const total = input.offers.length;
  const findings: GapFinding[] = [];

  for (const ours of input.ourFacets) {
    const def = facetDef(ours.key);
    if (!def) continue;

    let mentionedCount = 0;
    let readableCount = 0;
    let matchCount = 0;
    const matchedRanks: number[] = [];
    const valueCounts = new Map<string, number>();

    for (const offer of input.offers) {
      if (def.cues.some((c) => offer.normalized.includes(c))) mentionedCount += 1;
      const hit = def.read(offer.normalized);
      if (!hit) continue;
      readableCount += 1;
      valueCounts.set(hit.value, (valueCounts.get(hit.value) ?? 0) + 1);
      if (matches(ours.kind, ours, hit.value, hit.num)) {
        matchCount += 1;
        matchedRanks.push(offer.rank);
      }
    }

    const b = band(readableCount, matchCount, minSample);
    const coveragePct = b === "INSUFFICIENT_DATA" || readableCount === 0 ? null : Math.round((matchCount / readableCount) * 1000) / 10;

    const otherValues: ValueCount[] = [...valueCounts.entries()]
      .filter(([v]) => v !== ours.value)
      .map(([value, count]) => ({ value, count, pct: Math.round((count / readableCount) * 1000) / 10 }))
      .sort((a, b2) => b2.count - a.count)
      .slice(0, 5);

    const comparison = ours.kind === "NUMERIC_HIGHER_BETTER" ? `${ours.value} ve üzeri` : ours.value;

    const scopeSentence =
      readableCount === 0
        ? `Taranan ${total} ilanın hiçbirinde ${ours.label.toLocaleLowerCase("tr")} okunamadı — bu özellik için ölçüm yapılamadı.`
        : b === "INSUFFICIENT_DATA"
          ? `Taranan ${total} ilandan yalnızca ${readableCount}'inde ${ours.label.toLocaleLowerCase("tr")} okunabildi; ${minSample} gözlem altında oran bildirilmiyor.`
          : `Taranan ${total} ilandan ${ours.label.toLocaleLowerCase("tr")} okunabilen ${readableCount}'inde ${comparison} ${matchCount} kez görüldü (%${coveragePct}).`;

    const headline =
      b === "INSUFFICIENT_DATA"
        ? `${ours.label}: veri yetersiz`
        : b === "NOT_OBSERVED"
          ? `${ours.label} — ${comparison} taranan kapsamda gözlenmedi`
          : `${ours.label} — ${comparison}, okunabilen ilanların %${coveragePct}'inde`;

    findings.push({
      facetKey: ours.key,
      label: ours.label,
      kind: ours.kind,
      unit: ours.unit,
      ourValue: ours.value,
      ourNum: ours.num,
      totalOffers: total,
      mentionedCount,
      readableCount,
      matchCount,
      coveragePct,
      band: b,
      opportunity: GAP_BAND_OPPORTUNITY[b],
      otherValues,
      scopeSentence,
      headline,
      matchedRanks,
    });
  }

  // Strongest opportunity first, then the widest evidence behind it — a RARE
  // finding read off 40 listings outranks a RARE one read off 9.
  const order: Record<GapBand, number> = { NOT_OBSERVED: 0, RARE: 1, MINORITY: 2, COMMON: 3, INSUFFICIENT_DATA: 4 };
  return findings.sort((a, b2) => order[a.band] - order[b2.band] || b2.readableCount - a.readableCount);
}

/**
 * What the scanned market looks like on facets we did NOT claim — the other
 * half of the picture. Used by the market profile, never by the gap list, so a
 * facet we do not have can never be presented as our own strength.
 */
export function facetDistribution(
  offers: Array<{ rank: number; normalized: string }>,
): Array<{ key: string; label: string; readableCount: number; values: ValueCount[] }> {
  const out: Array<{ key: string; label: string; readableCount: number; values: ValueCount[] }> = [];
  for (const def of FACET_DEFS) {
    const counts = new Map<string, number>();
    let readable = 0;
    for (const offer of offers) {
      const hit = def.read(offer.normalized);
      if (!hit) continue;
      readable += 1;
      counts.set(hit.value, (counts.get(hit.value) ?? 0) + 1);
    }
    if (readable === 0) continue;
    out.push({
      key: def.key,
      label: def.label,
      readableCount: readable,
      values: [...counts.entries()]
        .map(([value, count]) => ({ value, count, pct: Math.round((count / readable) * 1000) / 10 }))
        .sort((a, b) => b.count - a.count),
    });
  }
  return out.sort((a, b) => b.readableCount - a.readableCount);
}
