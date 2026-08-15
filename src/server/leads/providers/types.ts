/**
 * AYZENITH LEAD FINDER — data-provider contract.
 *
 * Mirrors RADAR's provider contract so the two modules share one mental model.
 * Two rules are baked into the types:
 *
 *  1. A provider returns data (`ok: true`) or an explicit error (`ok: false`) —
 *     never a fabricated third path. A source outage surfaces as an error the
 *     pipeline records; it is never masked as "no results".
 *
 *  2. Every discovered candidate travels with its origin (`sourceType` + a URL
 *     when available), so provenance is enforceable end to end (§19).
 */

/** Free sources wired in V1. The paid slot is intentionally absent — adding one
 *  later is a new value here, never a change to how the pipeline is structured. */
export type LeadProviderId = "overpass" | "nominatim" | "website" | "vies" | "wikidata";

export type LeadSourceKind =
  | "OSM"
  | "OFFICIAL_WEBSITE"
  | "PUBLIC_WEB"
  | "PUBLIC_BUSINESS_DIRECTORY"
  | "OTHER_FREE_SOURCE";

/** A raw candidate as discovered from a free source — BEFORE dedup, verification
 *  and scoring. Only fields the source actually provided are set; everything else
 *  stays undefined (never guessed). */
export type LeadCandidate = {
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  country: string;
  city?: string;
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  /** Raw OSM/website role hints (e.g. "shop=lingerie") — mapped to LeadRole later. */
  roleHints: string[];
  /** OSM shop/office value or similar raw type tag, for classification. */
  rawType?: string;
  /** OSM `brand:wikidata` (or `wikidata`) id, when the outlet carries one (§V3.11).
   *  Lets a chain be looked up in Wikidata, which — unlike OSM — states what the
   *  brand actually sells. */
  brandWikidataId?: string;
  discoveredVia: LeadSourceKind;
  sourceUrl?: string;
  sourceLabel?: string;
};

export type ProviderOk<T> = { ok: true; value: T };
export type ProviderErr = { ok: false; error: string };
export type ProviderResult<T> = ProviderOk<T> | ProviderErr;

export function ok<T>(value: T): ProviderOk<T> {
  return { ok: true, value };
}
export function err(error: string): ProviderErr {
  return { ok: false, error };
}
