import "server-only";

import { cachedFetch } from "../cache";
import { type Citation, type ProviderResult, type YearValue, err, ok } from "./types";

/**
 * AYZENITH RADAR — Eurostat provider (EU fallback / enrichment).
 *
 * Free, no API key, JSON-stat. Comtrade is the primary source and covers EU
 * markets fully, so Eurostat is used as a FALLBACK for EU import values when a
 * Comtrade call comes back empty — a second official opinion, not a duplicate
 * pipeline. It targets the Comext "EU trade since 1988 by HS6" dataset
 * (ds-045409) via the dissemination API. Best-effort: on any shape mismatch or
 * outage it returns an explicit error and the orchestrator keeps the Comtrade
 * result (or records the gap honestly).
 */

const BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const DATASET = "ds-045409"; // EU trade since 1988 by HS2-HS6

type JsonStat = {
  value?: Record<string, number> | number[];
  dimension?: {
    time?: { category?: { index?: Record<string, number>; label?: Record<string, string> } };
  };
  error?: unknown;
};

/** Sum every numeric observation in a tightly-filtered JSON-stat response. */
function sumValues(v: JsonStat["value"]): number {
  if (!v) return 0;
  const nums = Array.isArray(v) ? v : Object.values(v);
  return nums.filter((n) => Number.isFinite(n)).reduce((a, b) => a + b, 0);
}

/**
 * EU-reported import value of one member state for the HS set, latest year.
 * `reporterIso` is the ISO alpha-2 (Eurostat uses the same geo codes, EL for
 * Greece). Returns a single latest-year value; used only as a Comtrade fallback.
 */
export async function getEuImport(
  reporterIso: string,
  hsCodes: string[],
  year: number,
): Promise<ProviderResult<YearValue>> {
  const geo = reporterIso.toUpperCase() === "GR" ? "EL" : reporterIso.toUpperCase();
  if (hsCodes.length === 0) return err("Eurostat: HS kodu listesi boş.");

  // Query one HS code at a time keeps the JSON-stat cube small and unambiguous.
  let total = 0;
  let matched = 0;
  const citations: Citation[] = [];
  for (const hs6 of hsCodes) {
    const params: Record<string, string> = {
      format: "JSON",
      reporter: geo,
      partner: "WORLD",
      product: hs6,
      flow: "1", // 1 = imports in Comext
      indicators: "VALUE_EUR",
      time: String(year),
    };
    const url = `${BASE}/${DATASET}?${new URLSearchParams(params).toString()}`;
    try {
      const { payload, fetchedAt } = await cachedFetch({
        provider: "eurostat",
        query: params,
        url,
      });
      const stat = payload as JsonStat;
      if (stat.error) continue;
      const v = sumValues(stat.value);
      if (v <= 0) continue;
      total += v;
      matched += 1;
      citations.push({
        provider: "eurostat",
        label: `${reporterIso} ithalatı (Eurostat) HS ${hs6} · ${year}`,
        query: params,
        rawValue: String(v),
        unit: "EUR",
        sourceUrl: url,
        fetchedAt: fetchedAt.toISOString(),
      });
    } catch {
      continue;
    }
  }

  if (matched === 0) return err("Eurostat: ithalat verisi bulunamadı.");
  return ok({ year, value: total }, citations);
}
