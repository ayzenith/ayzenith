import "server-only";

import { cachedFetch } from "../cache";
import { toM49 } from "./comtrade";
import { type Citation, type ProviderResult, err, ok } from "./types";

/**
 * AYZENITH RADAR — World Bank WITS / UNCTAD TRAINS tariff provider.
 *
 * Free, no key. Supplies the applied customs duty on TR-origin goods for the
 * "entry ease" criterion. WITS returns SDMX-XML; we extract the observed AVE
 * (ad-valorem-equivalent) tariff and take the effectively-applied (lowest, i.e.
 * preferential where present) rate. This is best-effort: for EU markets the
 * orchestrator already knows TR industrial goods are duty-free under the Customs
 * Union, so WITS mainly matters for non-EU markets. On any problem it returns an
 * explicit error and the entry criterion falls back honestly.
 */

const BASE = "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/trn";

/** Extract all OBS_VALUE numbers from a WITS SDMX-XML payload. */
function extractObsValues(xml: string): number[] {
  const out: number[] = [];
  // SDMX 2.1 generic: <generic:ObsValue value="0"/> ; also handle OBS_VALUE attr.
  const re = /(?:ObsValue value|OBS_VALUE)="?([0-9]+(?:\.[0-9]+)?)"?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Applied customs duty (%) on TR-origin goods entering `reporterIso` for the HS
 * set, using the most recent available year. Returns the simple average across
 * the queried HS codes of the effectively-applied (lowest) rate.
 */
export async function getAppliedTariff(
  reporterIso: string,
  hsCodes: string[],
  year: number,
): Promise<ProviderResult<number>> {
  const reporter = toM49(reporterIso);
  const partner = toM49("TR");
  if (!reporter || !partner) return err(`WITS: bilinmeyen ülke kodu ${reporterIso}`);
  if (hsCodes.length === 0) return err("WITS: HS kodu listesi boş.");

  const perHsRates: number[] = [];
  const citations: Citation[] = [];

  for (const hs6 of hsCodes) {
    const url =
      `${BASE}/reporter/${reporter}/partner/${partner}` +
      `/product/${hs6}/year/${year}/datatype/reported`;
    const query = { reporter, partner, product: hs6, year, datatype: "reported" };
    try {
      const { payload, fetchedAt } = await cachedFetch({
        provider: "wits",
        query,
        url,
        parse: (t) => t, // keep raw XML text
      });
      const values = extractObsValues(String(payload));
      if (values.length === 0) continue;
      // Effectively applied = the lowest observed rate (preferential when present).
      const applied = Math.min(...values);
      perHsRates.push(applied);
      citations.push({
        provider: "wits",
        label: `Gümrük vergisi (TR menşeli) HS ${hs6} · ${year}`,
        query,
        rawValue: String(applied),
        unit: "%",
        sourceUrl: url,
        fetchedAt: fetchedAt.toISOString(),
      });
    } catch {
      // Skip this HS code; other codes may still yield a rate.
      continue;
    }
  }

  if (perHsRates.length === 0) return err("WITS: tarife verisi bulunamadı.");
  const avg = perHsRates.reduce((a, b) => a + b, 0) / perHsRates.length;
  return ok(Number(avg.toFixed(2)), citations);
}
