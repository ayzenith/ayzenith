/**
 * AYZENITH RADAR — data-provider contract.
 *
 * Every trade-data source (Comtrade, Eurostat, WITS) returns results in this
 * shape. Two rules are baked into the type system here:
 *
 *  1. A provider either returns data (`ok: true`) or an explicit error
 *     (`ok: false`) — there is no third "made something up" path. A source
 *     outage surfaces as an error the pipeline records; it is never masked.
 *
 *  2. Every datum travels with its `Citation` — the exact query, the raw value
 *     and a source URL — so the "no unsourced number shown as verified" rule is
 *     enforceable end to end.
 */

import type { RadarCriterionKey } from "@/config/radar";

export type ProviderId = "comtrade" | "eurostat" | "wits";

/** A source record for one fetched numeric value. Persisted (as RadarCitation)
 *  on the snapshot so any figure can be clicked through and audited. */
export type Citation = {
  provider: ProviderId;
  /** Human label, e.g. "Almanya elektronik ithalatı 2024". */
  label: string;
  /** The exact normalized query used to fetch it. */
  query: Record<string, string | number>;
  /** Raw value exactly as returned, kept as string to avoid precision loss. */
  rawValue: string;
  unit?: string;
  sourceUrl?: string;
  fetchedAt: string; // ISO timestamp
  /** Which of the 5 scoring criteria this citation backs (§ audit finding —
   *  citations previously attached only at the snapshot level, with no
   *  structured link to which criterion they support; a person had to infer
   *  the mapping from the label text). Some provider calls feed more than one
   *  criterion (the target import series backs both demand and growth), hence
   *  an array. Attached by the orchestrator (analyze.ts), which is the only
   *  place that knows WHY a given call was made — the provider itself doesn't. */
  criterionKeys?: RadarCriterionKey[];
};

export type ProviderOk<T> = {
  ok: true;
  value: T;
  citations: Citation[];
  /** Non-fatal caveat: the result is real, but some underlying calls could not
   *  be measured (network/HTTP/throttling failure, not a genuine "no data"
   *  response) and were excluded rather than silently counted as zero/absent.
   *  Surfaced to `errors[]` so a degraded-but-usable result is never presented
   *  with the same confidence as a complete one. */
  warning?: string;
};
export type ProviderErr = { ok: false; error: string };
export type ProviderResult<T> = ProviderOk<T> | ProviderErr;

export function ok<T>(value: T, citations: Citation[] = [], warning?: string): ProviderOk<T> {
  return { ok: true, value, citations, warning };
}
export function err(error: string): ProviderErr {
  return { ok: false, error };
}

/** A (year, value) pair used for import/export series. */
export type YearValue = { year: number; value: number };

/** Import/export value of one country for the resolved HS set, latest year. */
export type CountryValue = { countryCode: string; value: number };
