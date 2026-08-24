import "server-only";

import { db } from "@/lib/db";
import { evaluateMarketReferenceMatch, type MarketReferenceQuery } from "./market-reference-match";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — Market Reference lookup (DB wrapper).
 *
 * Read-only. Never writes to LogisticsEstimate, never touches
 * estimatedMinEur/estimatedMaxEur, never joins into LogisticsBenchmark. A
 * Market Reference is always its own citation — `kind` and `label` below
 * exist so a caller cannot accidentally present one as a real freight
 * estimate; there is no field here that could be assigned onto an Estimate
 * row by mistake.
 */
export interface MarketReferenceMatch {
  kind: "MARKET_REFERENCE";
  label: "Piyasa Referansı";
  referenceId: string;
  sourceName: string;
  sourceUrl: string | null;
  priceType: "EXACT" | "RANGE";
  priceExact: string | null;
  priceMin: string | null;
  priceMax: string | null;
  currency: string;
  weightScopeType: "EXACT" | "UP_TO" | "RANGE";
  weightScopeMinKg: number | null;
  weightScopeMaxKg: number | null;
  /** false whenever the reference only named a country — a caller MUST NOT
   *  present the price as specific to the query's city in that case. */
  destCityScoped: boolean;
  scopeNote: string | null;
  conditionsNote: string | null;
}

export async function resolveMarketReferences(query: MarketReferenceQuery): Promise<MarketReferenceMatch[]> {
  const candidates = await db.logisticsMarketReference.findMany({
    where: { originCountry: query.originCountry, destCountry: query.destCountry },
    include: { source: true },
  });

  const matches: MarketReferenceMatch[] = [];
  for (const ref of candidates) {
    const evaluation = evaluateMarketReferenceMatch(ref, query);
    if (!evaluation.matches) continue;

    matches.push({
      kind: "MARKET_REFERENCE",
      label: "Piyasa Referansı",
      referenceId: ref.id,
      sourceName: ref.source.name,
      sourceUrl: ref.sourceUrl,
      priceType: ref.priceType,
      priceExact: ref.priceExact?.toString() ?? null,
      priceMin: ref.priceMin?.toString() ?? null,
      priceMax: ref.priceMax?.toString() ?? null,
      currency: ref.currency,
      weightScopeType: ref.weightScopeType,
      weightScopeMinKg: ref.weightScopeMinKg,
      weightScopeMaxKg: ref.weightScopeMaxKg,
      destCityScoped: evaluation.citySpecific,
      scopeNote: evaluation.citySpecific
        ? null
        : `Bu referans ${ref.destCountry} ülke genelinde yayınlanmış; ${query.destCity ?? "belirtilen şehre"} özel değildir.`,
      conditionsNote: ref.conditionsNote,
    });
  }

  return matches;
}
