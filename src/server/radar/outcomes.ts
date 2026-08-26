import "server-only";

import { db } from "@/lib/db";

/**
 * AYZENITH — RADAR → Lead Finder → Business OS, the closing hop.
 *
 * The forward path already exists and is deliberately one-way and lossy-by-copy
 * (see src/server/os/leadbridge.ts): RADAR context is carried onto LeadSearch at
 * creation, and Lead Finder context is copied onto Party at transfer. Neither
 * write-back into RADAR or Lead Finder — their frozen rows must never change
 * after the fact.
 *
 * This module closes the loop the other way, but strictly as a READ-ONLY
 * aggregate. It never touches RadarSnapshot, RadarCitation, LeadCompany or
 * LeadSearch. It answers one question — "what actually happened commercially
 * in this market afterwards?" — by joining Business OS records back through
 * the plain-string breadcrumbs (LeadSearch.country/categoryKey, Party.leadSearchId).
 *
 * Because it is read-only and additive, it can never change a RADAR score, a
 * RADAR confidence figure, or a Lead Finder score — those stay exactly what the
 * scoring engine computed. This is a "ground truth" display layer, not a
 * scoring input.
 */
export type MarketOutcomes = {
  searchCount: number;
  leadsDiscovered: number;
  partiesCreated: number;
  confirmedSales: number;
  totalRevenueByCurrency: Array<{ currency: string; total: number }>;
  totalProfitByCurrency: Array<{ currency: string; total: number }>;
};

/**
 * Aggregates real Business OS outcomes for every Lead Finder search that
 * targeted this RADAR category + country. Scoped at the market level (not the
 * single snapshot) because a market keeps producing sales long after any one
 * analysis run — the question is "how did this market actually go", not
 * "how did this exact run go".
 */
export async function getMarketOutcomes(categoryKey: string, countryCode: string): Promise<MarketOutcomes | null> {
  const searches = await db.leadSearch.findMany({
    where: { categoryKey, country: countryCode },
    select: { id: true, totalDiscovered: true },
  });
  if (searches.length === 0) return null;

  const searchIds = searches.map((s) => s.id);
  const leadsDiscovered = searches.reduce((sum, s) => sum + s.totalDiscovered, 0);

  const parties = await db.party.findMany({
    where: { leadSearchId: { in: searchIds } },
    select: { id: true },
  });
  if (parties.length === 0) {
    return {
      searchCount: searches.length,
      leadsDiscovered,
      partiesCreated: 0,
      confirmedSales: 0,
      totalRevenueByCurrency: [],
      totalProfitByCurrency: [],
    };
  }

  const partyIds = parties.map((p) => p.id);
  const sales = await db.sale.findMany({
    where: { customerId: { in: partyIds }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { currency: true, total: true, profit: true },
  });

  const revenueByCcy = new Map<string, number>();
  const profitByCcy = new Map<string, number>();
  for (const s of sales) {
    revenueByCcy.set(s.currency, (revenueByCcy.get(s.currency) ?? 0) + Number(s.total));
    profitByCcy.set(s.currency, (profitByCcy.get(s.currency) ?? 0) + Number(s.profit));
  }

  return {
    searchCount: searches.length,
    leadsDiscovered,
    partiesCreated: parties.length,
    confirmedSales: sales.length,
    totalRevenueByCurrency: Array.from(revenueByCcy, ([currency, total]) => ({ currency, total })),
    totalProfitByCurrency: Array.from(profitByCcy, ([currency, total]) => ({ currency, total })),
  };
}
