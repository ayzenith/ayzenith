import "server-only";

import type { LeadCandidate } from "./providers/types";
import { normalizeProduct } from "@/config/leads";

/**
 * AYZENITH LEAD FINDER — company identity & branch de-duplication (§4/§13/§14).
 *
 * The same FIRM surfaces many times: different search terms, and several physical
 * BRANCHES of one chain (C&A Berlin 1/2/3). This resolves them into ONE company
 * with N locations — never N separate company leads:
 *
 *   • Domain is the strongest identity signal (`d:<domain>`).
 *   • Otherwise a normalised brand/name key (`n:<canonical>`) merges branches of
 *     the same chain across a city/country. City is deliberately NOT part of the
 *     key so multi-city branches collapse under one company.
 *
 * To avoid WRONG merges (different firms sharing a generic name), the name key is
 * only used when there is no domain, and the representative record keeps the
 * richest data. Every distinct physical location is preserved as a branch.
 */

export type LeadLocationDraft = {
  name?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  sourceUrl?: string;
};

export type DedupedCandidate = {
  /** Representative (richest) record — its contact/website become company-level. */
  candidate: LeadCandidate;
  /** Normalised brand/name used as the identity key when no domain exists. */
  canonicalName: string;
  /** Distinct physical branches found for this firm (≥1). */
  branchCount: number;
  /** Every distinct branch, preserved for the Locations model/sheet (§4/§9). */
  locations: LeadLocationDraft[];
  /** Alternate source URLs merged in (kept for provenance). */
  mergedSourceUrls: string[];
};

/** Normalise a website to its registrable-ish domain (host without leading www). */
export function normalizeDomain(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.includes("://") ? website : `https://${website}`;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

/** Canonical brand/name: prefer OSM brand, fall back to name; normalised. */
function canonicalOf(c: LeadCandidate): string {
  return normalizeProduct(c.name);
}

function dedupKey(c: LeadCandidate): string {
  const domain = normalizeDomain(c.website);
  if (domain) return `d:${domain}`;
  const country = normalizeProduct(c.country ?? "");
  return `n:${canonicalOf(c)}|${country}`;
}

/** Pick the richer of two candidates (more filled contact/location fields wins). */
function richness(c: LeadCandidate): number {
  let n = 0;
  if (c.website) n += 2;
  if (c.email) n += 1;
  if (c.phone) n += 1;
  if (c.address) n += 1;
  if (c.postalCode) n += 1;
  if (c.latitude != null && c.longitude != null) n += 1;
  return n;
}

function locationKey(c: LeadCandidate): string {
  if (c.latitude != null && c.longitude != null) {
    return `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`;
  }
  return normalizeProduct(`${c.address ?? ""} ${c.city ?? ""} ${c.postalCode ?? ""}`);
}

function toLocation(c: LeadCandidate): LeadLocationDraft {
  return {
    name: c.name,
    address: c.address,
    city: c.city,
    postalCode: c.postalCode,
    latitude: c.latitude,
    longitude: c.longitude,
    phone: c.phone,
    sourceUrl: c.sourceUrl,
  };
}

export function dedupeCandidates(candidates: LeadCandidate[]): DedupedCandidate[] {
  const groups = new Map<
    string,
    {
      best: LeadCandidate;
      roleHints: Set<string>;
      locKeys: Set<string>;
      locations: LeadLocationDraft[];
      urls: Set<string>;
    }
  >();

  for (const c of candidates) {
    const key = dedupKey(c);
    const lk = locationKey(c);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        best: c,
        roleHints: new Set(c.roleHints),
        locKeys: new Set([lk]),
        locations: [toLocation(c)],
        urls: new Set(c.sourceUrl ? [c.sourceUrl] : []),
      });
      continue;
    }
    if (richness(c) > richness(existing.best)) existing.best = c;
    for (const h of c.roleHints) existing.roleHints.add(h);
    if (!existing.locKeys.has(lk)) {
      existing.locKeys.add(lk);
      existing.locations.push(toLocation(c));
    }
    if (c.sourceUrl) existing.urls.add(c.sourceUrl);
  }

  // SECOND PASS — reunite a chain that OSM tagged inconsistently.
  //
  // Identity switches key depending on whether a branch happens to carry a
  // website tag, so one chain splits in two: in the live Milano search OVS came
  // back twice — once as `d:ovs.it` (score 78, site + e-mail + social) and once
  // as `n:ovs` (score 59, phone only) — and METRO did the same. To the reader
  // these are two firms with two different verdicts, and the weaker row is the
  // same company with its evidence stripped off.
  //
  // A name group is folded into a domain group only when the canonical names
  // match exactly and only when that target is UNAMBIGUOUS: if two different
  // domains carry the same name they are more likely two firms than one, and
  // guessing which to merge into would invent a fact. This adds no risk the name
  // key does not already carry, since those branches were merged with each other
  // on the same name a moment ago.
  const byName = new Map<string, { key: string; count: number }>();
  for (const [key, g] of groups) {
    if (!key.startsWith("d:")) continue;
    const nameKey = `${canonicalOf(g.best)}|${normalizeProduct(g.best.country ?? "")}`;
    const seen = byName.get(nameKey);
    if (seen) seen.count++;
    else byName.set(nameKey, { key, count: 1 });
  }
  for (const [key, g] of Array.from(groups)) {
    if (!key.startsWith("n:")) continue;
    const target = byName.get(key.slice(2));
    if (!target || target.count !== 1) continue;
    const into = groups.get(target.key);
    if (!into) continue;
    if (richness(g.best) > richness(into.best)) into.best = g.best;
    for (const h of g.roleHints) into.roleHints.add(h);
    for (const u of g.urls) into.urls.add(u);
    // locKeys and locations are appended together on every path, so they stay
    // index-aligned.
    const gKeys = Array.from(g.locKeys);
    for (let i = 0; i < g.locations.length; i++) {
      const lk = gKeys[i];
      if (lk == null || into.locKeys.has(lk)) continue;
      into.locKeys.add(lk);
      into.locations.push(g.locations[i]!);
    }
    groups.delete(key);
  }

  const out: DedupedCandidate[] = [];
  for (const g of groups.values()) {
    out.push({
      candidate: { ...g.best, roleHints: Array.from(g.roleHints) },
      canonicalName: canonicalOf(g.best),
      branchCount: g.locations.length,
      locations: g.locations,
      mergedSourceUrls: Array.from(g.urls),
    });
  }
  return out;
}
