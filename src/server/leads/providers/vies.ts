import "server-only";

import { cachedLeadFetch } from "../cache";

/**
 * AYZENITH LEAD FINDER — EU VAT validation via VIES (free, official).
 *
 * VIES is the European Commission's own VAT-number checking service. It answers
 * one question we could not otherwise answer from free sources: is this a REAL,
 * currently registered business, cleared to trade across EU borders?
 *
 * It fits this module unusually well because the input is already on the page we
 * read. A German Impressum is legally required to state the USt-IdNr, and other
 * EU countries print theirs on the equivalent legal page, so the number arrives
 * with the crawl and costs nothing extra to obtain.
 *
 * Measured behaviour (live, 2026-08-15), which shapes how the result is used:
 *   • Validity is returned for every member state, in ~200–400ms.
 *   • The registered NAME comes back for most countries — Italy answered
 *     "MOTOROLA SOLUTIONS ITALIA SRL", the Netherlands "SHELL CHEMICALS EUROPE
 *     B.V." — but GERMANY returns "---" by national policy. So the name is a
 *     bonus where it exists, never something to rely on.
 *   • An unknown number answers isValid:false rather than erroring.
 *
 * That last point is why only a POSITIVE result is ever recorded. Our extraction
 * of the number from page text can be wrong, so "invalid" may mean the company
 * is fine and we simply read the wrong string. Treating that as a finding about
 * the firm would be exactly the kind of unearned negative this module refuses to
 * make.
 *
 * Non-EU markets have no VIES entry at all: Switzerland, Norway and the UK are
 * outside it. Their absence is not a signal either.
 */

/** ISO codes VIES covers. "EL" is Greece's VAT prefix (not "GR"). */
const VIES_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

export type VatCheck = {
  /** The normalised id we asked about, e.g. "DE296480525". */
  vatId: string;
  valid: boolean;
  /** Officially registered name, when the member state discloses it. */
  name?: string;
  address?: string;
  sourceUrl: string;
};

/** Normalise a VAT id as printed on a page: strip spaces, dots and dashes and
 *  upper-case it. Returns null if it is not a plausible EU VAT id. */
export function normalizeVatId(raw: string): { country: string; number: string } | null {
  const cleaned = raw.replace(/[\s.\-/]/g, "").toUpperCase();
  const m = cleaned.match(/^([A-Z]{2})([0-9A-Z+*]{8,12})$/);
  if (!m) return null;
  const [, country, number] = m as unknown as [string, string, string];
  if (!VIES_COUNTRIES.has(country)) return null;
  return { country, number };
}

/**
 * Ask VIES whether a VAT id is registered. Returns null when the service could
 * not be reached — never a false "invalid", because an outage says nothing about
 * the company. Cached for 30 days like every other free source we use.
 */
export async function checkVatId(raw: string): Promise<VatCheck | null> {
  const parsed = normalizeVatId(raw);
  if (!parsed) return null;
  const { country, number } = parsed;
  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${number}`;

  try {
    const res = await cachedLeadFetch({
      provider: "vies",
      query: { vat: `${country}${number}` },
      url,
      headers: { accept: "application/json" },
      timeoutMs: 12_000,
      ttlDays: 30,
      // A service error must not be stored as a verdict.
      validate: (p) => typeof (p as { isValid?: unknown })?.isValid === "boolean",
    });
    const p = (res.payload ?? {}) as { isValid?: boolean; name?: string; address?: string };
    // Germany (and others) answer "---" instead of withholding the field.
    const clean = (v?: string) => {
      const t = (v ?? "").trim();
      return t && !/^-+$/.test(t) ? t : undefined;
    };
    return {
      vatId: `${country}${number}`,
      valid: p.isValid === true,
      name: clean(p.name),
      address: clean(p.address),
      sourceUrl: url,
    };
  } catch {
    return null; // unreachable → unknown, not negative
  }
}
