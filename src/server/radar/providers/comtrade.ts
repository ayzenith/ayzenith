import "server-only";

import { cachedFetch } from "../cache";
import {
  type CountryValue,
  type ProviderResult,
  err,
  ok,
} from "./types";

/**
 * AYZENITH RADAR — UN Comtrade provider (the workhorse).
 *
 * Uses the FREE public preview endpoint (no subscription key, UN M49 codes).
 *
 * A hard-won lesson about this endpoint: it is only RELIABLE when queried one
 * (reporter, commodity, year) at a time. Multi-value cmdCode/period combined
 * with the aggregation filters returns nothing, and un-filtered queries hit the
 * 500-row cap with granular partner2/customs/mode breakdowns that hide the true
 * total. So the single robust primitive is:
 *
 *   reporter + partner + ONE cmd + ONE year + customsCode=C00 + motCode=0
 *
 * which returns the clean aggregate as the `partner2Code === 0` row, and — when
 * partner = World — every source country as the `partner2Code !== 0` rows in the
 * SAME response. Higher-level methods loop this primitive with bounded
 * concurrency; the persistent cache means overlapping needs (demand, growth,
 * sub-categories, competition all reuse the target's per-cmd/year calls) never
 * re-hit the network. Every method returns real data + citations, or an explicit
 * error — never fabricated numbers.
 */

const BASE = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";

/** ISO 3166-1 alpha-2 → UN M49 numeric code. */
const ISO_TO_M49: Record<string, string> = {
  DE: "276", FR: "250", NL: "528", BE: "056", IT: "380", ES: "724",
  PL: "616", SE: "752", AT: "040", DK: "208", FI: "246", PT: "620",
  CZ: "203", RO: "642", GR: "300", HU: "348", IE: "372", LU: "442",
  CH: "756", NO: "578", SK: "703", SI: "705", BG: "100", HR: "191",
  EE: "233", LV: "428", LT: "440", CY: "196", MT: "470", TR: "792",
  // Major world suppliers — so import SOURCE breakdowns decode to real ISO codes
  // (partner2Code) instead of falling back to a bare numeric M49 string.
  CN: "156", VN: "704", US: "842", JP: "392", KR: "410", IN: "356",
  TW: "490", HK: "344", GB: "826", MX: "484", TH: "764", MY: "458",
  ID: "360", SG: "702", PH: "608", BD: "050", PK: "586", RU: "643",
  UA: "804", RS: "688", EG: "818", MA: "504", TN: "788", BR: "076",
  CA: "124", AU: "036", NZ: "554", ZA: "710", AE: "784", SA: "682",
};
const M49_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_TO_M49).map(([iso, m49]) => [String(Number(m49)), iso]),
);
const TR_M49 = "792";
const WORLD = "0";

export function toM49(iso: string): string | null {
  return ISO_TO_M49[iso.toUpperCase()] ?? null;
}

type ComtradeRow = {
  period?: number;
  reporterCode?: number;
  partnerCode?: number;
  partner2Code?: number;
  cmdCode?: string;
  flowCode?: string;
  primaryValue?: number;
};

function rowsOf(payload: unknown): ComtradeRow[] {
  const data = (payload as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as ComtradeRow[]) : [];
}

function buildUrl(params: Record<string, string>): string {
  return `${BASE}?${new URLSearchParams(params).toString()}`;
}

/** Run `fn` over `items` with a bounded number of concurrent workers, so a big
 *  analysis never fires 100+ requests at the endpoint in one burst. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      if (item === undefined) continue;
      out[i] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ----------------------------------------------------------------------------
// The single reliable primitive + a cached wrapper.
// ----------------------------------------------------------------------------

type ReporterWorld = {
  /** Clean aggregate total (partner2Code === 0), or null if the response had no
   *  row for this (reporter, cmd, year) — genuinely means "no data reported". */
  total: number | null;
  /** Source-country breakdown (partner2Code !== 0) → ISO/value. */
  sources: CountryValue[];
  fetchedAt: string;
  url: string;
  /** True only when the call itself failed (network/HTTP/throttled-after-retries)
   *  — distinct from a clean response that simply had no rows. A `failed` job
   *  must never be treated the same as "this country/year has zero trade": the
   *  caller excludes it from sums/baskets AND records that it could not be
   *  measured, so a throttled request can no longer silently change a score
   *  (see cache.ts rate-limiting fix, 2026-08-23). */
  failed: boolean;
};

/** One (reporter, cmd, year, flow=M, partner=World) call → total + sources. */
async function fetchReporterWorld(
  reporterM49: string,
  cmd: string,
  year: number,
): Promise<ReporterWorld> {
  const params = {
    reporterCode: reporterM49,
    partnerCode: WORLD,
    period: String(year),
    cmdCode: cmd,
    flowCode: "M",
    customsCode: "C00",
    motCode: "0",
  };
  const url = buildUrl(params);
  try {
    const { payload, fetchedAt } = await cachedFetch({
      provider: "comtrade",
      query: params,
      url,
    });
    const rows = rowsOf(payload);
    if (rows.length === 0) return { total: null, sources: [], fetchedAt: fetchedAt.toISOString(), url, failed: false };
    const totalRow = rows.find((r) => (r.partner2Code ?? -1) === 0);
    const sources: CountryValue[] = rows
      .filter((r) => (r.partner2Code ?? 0) !== 0 && r.primaryValue != null)
      .map((r) => ({
        countryCode: M49_TO_ISO[String(r.partner2Code)] ?? String(r.partner2Code),
        value: r.primaryValue as number,
      }));
    return {
      total: totalRow?.primaryValue ?? null,
      sources,
      fetchedAt: fetchedAt.toISOString(),
      url,
      failed: false,
    };
  } catch {
    // Network/HTTP/throttling failure — NOT "no data". Caller must not count
    // this the same as a real empty response.
    return { total: null, sources: [], fetchedAt: new Date().toISOString(), url, failed: true };
  }
}

/** One (TR, partner, cmd, year, flow=X) bilateral export call → single value. */
async function fetchBilateralExport(
  partnerM49: string,
  cmd: string,
  year: number,
): Promise<{ value: number | null; fetchedAt: string; url: string; failed: boolean }> {
  const params = {
    reporterCode: TR_M49,
    partnerCode: partnerM49,
    period: String(year),
    cmdCode: cmd,
    flowCode: "X",
    customsCode: "C00",
    motCode: "0",
  };
  const url = buildUrl(params);
  try {
    const { payload, fetchedAt } = await cachedFetch({
      provider: "comtrade",
      query: params,
      url,
    });
    const rows = rowsOf(payload);
    const totalRow = rows.find((r) => (r.partner2Code ?? -1) === 0);
    return {
      value: totalRow?.primaryValue ?? null,
      fetchedAt: fetchedAt.toISOString(),
      url,
      failed: false,
    };
  } catch {
    return { value: null, fetchedAt: new Date().toISOString(), url, failed: true };
  }
}

const CONCURRENCY = 6;

// ----------------------------------------------------------------------------
// Public API — same signatures the orchestrator expects.
// ----------------------------------------------------------------------------

export type ImportSeriesResult = {
  /** Most recent year with the fullest basket coverage. */
  latestYear: number;
  /** Sum of all HS codes present at `latestYear` — the demand figure. */
  latestValue: number;
  /** Value-weighted average CAGR across the HS codes (each code over its own
   *  reported span), or null when no code had ≥2 positive years. */
  growthCagr: number | null;
  /** Longest per-code span (years) used for growth — for reporting. */
  growthYears: number;
};

/**
 * Import data for one reporter over several years (World partner). Demand and
 * growth are decoupled so neither is distorted by partial recent reporting:
 *   • demand  = sum of ALL codes at the fullest recent year.
 *   • growth  = value-weighted mean of each code's OWN CAGR, so a code missing a
 *     year doesn't collapse the whole basket's trend.
 */
export async function getImportSeries(
  reporterIso: string,
  hsCodes: string[],
  years: number[],
): Promise<ProviderResult<ImportSeriesResult>> {
  const reporter = toM49(reporterIso);
  if (!reporter) return err(`Bilinmeyen ülke kodu: ${reporterIso}`);
  if (hsCodes.length === 0) return err("HS kodu listesi boş.");

  const jobs = years.flatMap((year) => hsCodes.map((cmd) => ({ year, cmd })));
  const results = await mapLimit(jobs, CONCURRENCY, (j) =>
    fetchReporterWorld(reporter, j.cmd, j.year).then((r) => ({ ...j, meta: r })),
  );

  // Build code → year → value, plus per-year coverage. A `failed` job (network/
  // HTTP/throttling) is EXCLUDED here, same as a real empty response, because
  // neither contributes a number — but it is also counted separately below so
  // the caller can tell "no trade reported" from "could not be measured".
  const byCode = new Map<string, Map<number, number>>();
  const coverage = new Map<number, number>();
  let fetchedAt = new Date().toISOString();
  let url = "";
  let failedJobs = 0;
  const failedByYear = new Map<number, number>();
  for (const { cmd, year, meta } of results) {
    if (meta.failed) {
      failedJobs++;
      failedByYear.set(year, (failedByYear.get(year) ?? 0) + 1);
      continue;
    }
    if (meta.total == null) continue;
    const inner = byCode.get(cmd) ?? new Map<number, number>();
    inner.set(year, meta.total);
    byCode.set(cmd, inner);
    coverage.set(year, (coverage.get(year) ?? 0) + 1);
    fetchedAt = meta.fetchedAt;
    url = meta.url;
  }
  if (byCode.size === 0) {
    return err(
      failedJobs > 0
        ? `Comtrade: ithalat verisi bulunamadı (${failedJobs}/${jobs.length} sorgu ölçülemedi — kaynak yanıt vermedi).`
        : "Comtrade: ithalat verisi bulunamadı.",
    );
  }

  // Latest year = most recent year with the maximal code coverage.
  const maxCov = Math.max(...coverage.values());
  const latestYear = Math.max(
    ...[...coverage.entries()].filter(([, c]) => c === maxCov).map(([y]) => y),
  );
  let latestValue = 0;
  for (const inner of byCode.values()) latestValue += inner.get(latestYear) ?? 0;

  // Growth: value-weighted mean of each code's own CAGR.
  let weightSum = 0;
  let weightedCagr = 0;
  let growthYears = 0;
  for (const inner of byCode.values()) {
    const pos = [...inner.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v > 0);
    const first = pos[0];
    const last = pos[pos.length - 1];
    if (!first || !last) continue;
    const span = last[0] - first[0];
    if (span < 1) continue;
    const cagr = (Math.pow(last[1] / first[1], 1 / span) - 1) * 100;
    const weight = inner.get(latestYear) ?? last[1];
    weightedCagr += cagr * weight;
    weightSum += weight;
    growthYears = Math.max(growthYears, span + 1);
  }
  const growthCagr = weightSum > 0 ? weightedCagr / weightSum : null;

  // The headline demand number is the one criterion the whole score depends on
  // (analyze.ts returns INSUFFICIENT_DATA without it) — so a failure exactly at
  // the chosen latest year is called out explicitly rather than folded silently
  // into "this HS code just wasn't traded".
  const failedAtLatest = failedByYear.get(latestYear) ?? 0;
  const warning =
    failedAtLatest > 0
      ? `${latestYear} yılı için ${failedAtLatest}/${hsCodes.length} HS kodu ölçülemedi (kaynak yanıt vermedi) — ithalat toplamı eksik olabilir.`
      : failedJobs > 0
        ? `${failedJobs} sorgu ölçülemedi (kaynak yanıt vermedi); etkilenmeyen yıl/kodlar kullanıldı.`
        : undefined;

  return ok(
    { latestYear, latestValue, growthCagr, growthYears },
    [
      {
        provider: "comtrade",
        label: `${reporterIso} ithalatı ${latestYear} (HS ${hsCodes.join("+")} toplamı)`,
        query: { reporterCode: reporter, period: latestYear, cmdCode: hsCodes.join(","), flowCode: "M" },
        rawValue: String(Math.round(latestValue)),
        unit: "USD",
        sourceUrl: url,
        fetchedAt,
      },
    ],
    warning,
  );
}

/** Latest-year World import value for a set of countries — the peer basket.
 *  `fallbackYear` covers countries that haven't reported the primary year yet
 *  (recent annual data lands unevenly), so the comparison basket stays full. */
export async function getImportsForCountries(
  isoCodes: string[],
  hsCodes: string[],
  year: number,
  fallbackYear?: number,
): Promise<ProviderResult<CountryValue[]>> {
  const codes = isoCodes.map((iso) => ({ iso, m49: toM49(iso) })).filter((c) => c.m49);
  if (codes.length === 0) return err("Geçerli ülke kodu yok.");

  // `couldNotMeasure` distinguishes "at least one call for this country failed
  // (network/HTTP/throttling)" from "the country genuinely reported no trade" —
  // a country in the FIRST group must never sit in the peer basket silently
  // indistinguishable from the second, since that basket drives the min–max
  // demand score (see cache.ts rate-limiting fix, 2026-08-23).
  async function sumForYear(m49: string, y: number): Promise<{ total: number | null; couldNotMeasure: boolean }> {
    const parts = await mapLimit(hsCodes, CONCURRENCY, (cmd) => fetchReporterWorld(m49, cmd, y));
    const present = parts.filter((r) => !r.failed && r.total != null).map((r) => r.total as number);
    const anyFailed = parts.some((r) => r.failed);
    return { total: present.length > 0 ? present.reduce((a, b) => a + b, 0) : null, couldNotMeasure: anyFailed };
  }

  const byCountry = new Map<string, number>();
  const unmeasured: string[] = [];
  await mapLimit(codes, CONCURRENCY, async (c) => {
    let r = await sumForYear(c.m49 as string, year);
    if (r.total == null && fallbackYear != null) {
      const fb = await sumForYear(c.m49 as string, fallbackYear);
      r = { total: fb.total, couldNotMeasure: r.couldNotMeasure || fb.couldNotMeasure };
    }
    if (r.total != null) byCountry.set(c.iso, r.total);
    else if (r.couldNotMeasure) unmeasured.push(c.iso);
  });
  if (byCountry.size === 0) {
    return err(
      unmeasured.length > 0
        ? `Comtrade: benzer pazar verisi bulunamadı (${unmeasured.length} ülke ölçülemedi — kaynak yanıt vermedi).`
        : "Comtrade: benzer pazar verisi bulunamadı.",
    );
  }

  const values: CountryValue[] = [...byCountry.entries()].map(([countryCode, value]) => ({
    countryCode,
    value,
  }));
  return ok(
    values,
    [
      {
        provider: "comtrade",
        label: `${values.length} benzer pazarın ithalatı ${year}`,
        query: { countries: codes.map((c) => c.iso).join(","), period: year, flowCode: "M" },
        rawValue: `${values.length} ülke`,
        unit: "USD",
        fetchedAt: new Date().toISOString(),
      },
    ],
    unmeasured.length > 0
      ? `${unmeasured.length} kıyas pazarı ölçülemedi (kaynak yanıt vermedi, "sıfır ticaret" değil): ${unmeasured.join(", ")}.`
      : undefined,
  );
}

/** Turkey → each destination export value, latest year (with a one-year
 *  fallback per destination for markets TR hasn't reported the latest year to). */
export async function getTrExportsToCountries(
  isoCodes: string[],
  hsCodes: string[],
  year: number,
  fallbackYear?: number,
): Promise<ProviderResult<CountryValue[]>> {
  const codes = isoCodes.map((iso) => ({ iso, m49: toM49(iso) })).filter((c) => c.m49);
  if (codes.length === 0) return err("Geçerli ülke kodu yok.");

  async function sumForYear(m49: string, y: number): Promise<{ total: number | null; couldNotMeasure: boolean }> {
    const parts = await mapLimit(hsCodes, CONCURRENCY, (cmd) => fetchBilateralExport(m49, cmd, y));
    const present = parts.filter((r) => !r.failed && r.value != null).map((r) => r.value as number);
    const anyFailed = parts.some((r) => r.failed);
    return { total: present.length > 0 ? present.reduce((a, b) => a + b, 0) : null, couldNotMeasure: anyFailed };
  }

  const byPartner = new Map<string, number>();
  const unmeasured: string[] = [];
  await mapLimit(codes, CONCURRENCY, async (c) => {
    let r = await sumForYear(c.m49 as string, year);
    if (r.total == null && fallbackYear != null) {
      const fb = await sumForYear(c.m49 as string, fallbackYear);
      r = { total: fb.total, couldNotMeasure: r.couldNotMeasure || fb.couldNotMeasure };
    }
    if (r.total != null) byPartner.set(c.iso, r.total);
    else if (r.couldNotMeasure) unmeasured.push(c.iso);
  });
  if (byPartner.size === 0) {
    return err(
      unmeasured.length > 0
        ? `Comtrade: Türkiye ihracat verisi bulunamadı (${unmeasured.length} ülke ölçülemedi — kaynak yanıt vermedi).`
        : "Comtrade: Türkiye ihracat verisi bulunamadı.",
    );
  }

  const values: CountryValue[] = [...byPartner.entries()].map(([countryCode, value]) => ({
    countryCode,
    value,
  }));
  return ok(
    values,
    [
      {
        provider: "comtrade",
        label: `Türkiye ihracatı → ${values.length} pazar ${year}`,
        query: { reporterCode: TR_M49, partners: codes.map((c) => c.iso).join(","), period: year, flowCode: "X" },
        rawValue: `${values.length} ülke`,
        unit: "USD",
        fetchedAt: new Date().toISOString(),
      },
    ],
    unmeasured.length > 0
      ? `${unmeasured.length} pazara Türkiye ihracatı ölçülemedi (kaynak yanıt vermedi): ${unmeasured.join(", ")}.`
      : undefined,
  );
}

/** Import value of the target market broken down by SOURCE country — reuses the
 *  same cached (reporter, cmd, latest-year) calls as the import series. */
export async function getImportSources(
  reporterIso: string,
  hsCodes: string[],
  year: number,
): Promise<ProviderResult<CountryValue[]>> {
  const reporter = toM49(reporterIso);
  if (!reporter) return err(`Bilinmeyen ülke kodu: ${reporterIso}`);

  const results = await mapLimit(hsCodes, CONCURRENCY, (cmd) =>
    fetchReporterWorld(reporter, cmd, year),
  );

  const bySource = new Map<string, number>();
  let url = "";
  let fetchedAt = new Date().toISOString();
  let failedCount = 0;
  for (const r of results) {
    if (r.failed) {
      failedCount++;
      continue;
    }
    url = r.url;
    fetchedAt = r.fetchedAt;
    for (const s of r.sources) {
      bySource.set(s.countryCode, (bySource.get(s.countryCode) ?? 0) + s.value);
    }
  }
  if (bySource.size === 0) {
    return err(
      failedCount > 0
        ? `Comtrade: kaynak ülke kırılımı bulunamadı (${failedCount}/${hsCodes.length} HS kodu ölçülemedi).`
        : "Comtrade: kaynak ülke kırılımı bulunamadı.",
    );
  }

  const values: CountryValue[] = [...bySource.entries()].map(([countryCode, value]) => ({
    countryCode,
    value,
  }));
  return ok(
    values,
    [
      {
        provider: "comtrade",
        label: `${reporterIso} ithalatının kaynak ülke kırılımı ${year}`,
        query: { reporterCode: reporter, period: year, cmdCode: hsCodes.join(","), flowCode: "M" },
        rawValue: `${values.length} kaynak ülke`,
        unit: "USD",
        sourceUrl: url,
        fetchedAt,
      },
    ],
    failedCount > 0
      ? `${failedCount}/${hsCodes.length} HS kodu ölçülemedi; kaynak ülke kırılımı eksik olabilir.`
      : undefined,
  );
}

/** Turkey → one destination export value PER HS-6 code, latest year (with a
 *  one-year fallback per code). Powers product-level TR share in the sub-category
 *  breakdown. Reuses the cached bilateral-export primitive. */
export async function getTrExportsByHsToCountry(
  destIso: string,
  hsCodes: string[],
  year: number,
  fallbackYear?: number,
): Promise<ProviderResult<Record<string, number>>> {
  const dest = toM49(destIso);
  if (!dest) return err(`Bilinmeyen ülke kodu: ${destIso}`);
  if (hsCodes.length === 0) return err("HS kodu listesi boş.");

  const results = await mapLimit(hsCodes, CONCURRENCY, async (cmd) => {
    let r = await fetchBilateralExport(dest, cmd, year);
    if (r.value == null && fallbackYear != null) {
      const fb = await fetchBilateralExport(dest, cmd, fallbackYear);
      r = { ...fb, failed: r.failed && fb.failed }; // still "unmeasured" only if BOTH attempts failed
    }
    return { cmd, value: r.value, failed: r.failed };
  });

  const byHs: Record<string, number> = {};
  let failedCount = 0;
  for (const { cmd, value, failed } of results) {
    if (value != null) byHs[cmd] = value;
    else if (failed) failedCount++;
  }
  if (Object.keys(byHs).length === 0) {
    return err(
      failedCount > 0
        ? `Comtrade: Türkiye'nin ürün bazında ihracat verisi bulunamadı (${failedCount}/${hsCodes.length} HS kodu ölçülemedi).`
        : "Comtrade: Türkiye'nin ürün bazında ihracat verisi bulunamadı.",
    );
  }
  return ok(
    byHs,
    [
      {
        provider: "comtrade",
        label: `Türkiye → ${destIso} ihracatı (HS bazında) ${year}`,
        query: { reporterCode: TR_M49, partnerCode: dest, period: year, cmdCode: hsCodes.join(","), flowCode: "X" },
        rawValue: `${Object.keys(byHs).length} ürün grubu`,
        unit: "USD",
        fetchedAt: new Date().toISOString(),
      },
    ],
    failedCount > 0 ? `${failedCount}/${hsCodes.length} ürün grubu ölçülemedi.` : undefined,
  );
}

/** Per-HS-6 import value + short trend for the target market → sub-category
 *  breakdown. Reuses the same cached per-(cmd,year) calls as the import series. */
export async function getSubcategorySeries(
  reporterIso: string,
  hsCodes: string[],
  years: number[],
  latestYear: number,
): Promise<ProviderResult<Array<{ hs6: string; latest: number; cagrPct: number | null }>>> {
  const reporter = toM49(reporterIso);
  if (!reporter) return err(`Bilinmeyen ülke kodu: ${reporterIso}`);

  // Only consider years up to the consistent latest year chosen by the demand
  // series, so every sub-category's "latest" is measured at the SAME year and a
  // partial newer year can't inflate one code over the others.
  const consideredYears = years.filter((y) => y <= latestYear);
  const jobs = hsCodes.flatMap((cmd) => consideredYears.map((year) => ({ cmd, year })));
  const results = await mapLimit(jobs, CONCURRENCY, (j) =>
    fetchReporterWorld(reporter, j.cmd, j.year).then((r) => ({ ...j, total: r.total, failed: r.failed })),
  );

  const byHs = new Map<string, Map<number, number>>();
  let failedCount = 0;
  for (const { cmd, year, total, failed } of results) {
    if (failed) {
      failedCount++;
      continue;
    }
    if (total == null) continue;
    const inner = byHs.get(cmd) ?? new Map<number, number>();
    inner.set(year, total);
    byHs.set(cmd, inner);
  }
  if (byHs.size === 0) {
    return err(
      failedCount > 0
        ? `Comtrade: alt kategori verisi bulunamadı (${failedCount}/${jobs.length} sorgu ölçülemedi).`
        : "Comtrade: alt kategori verisi bulunamadı.",
    );
  }

  const result = [...byHs.entries()].map(([hs6, inner]) => {
    const ordered = [...inner.entries()].sort((a, b) => a[0] - b[0]);
    const latest = inner.get(latestYear) ?? ordered[ordered.length - 1]?.[1] ?? 0;
    // Compound growth is measured over ELAPSED YEARS, not over the number of
    // data points. Dropping the years here (`.map(([, v]) => v)`) and dividing by
    // `pos.length - 1` silently treated a gap in the series as if no time had
    // passed — and Comtrade series do have gaps, because countries skip
    // reporting years. Measured on a cached series (HS 851821) whose reported
    // years span three but hold only two positive points, the old formula
    // returned −54.2% where the true rate is −40.6%. The main demand series
    // above always used the year span; this is the same arithmetic.
    const pos = ordered.filter(([, v]) => v > 0);
    const first = pos[0];
    const last = pos[pos.length - 1];
    let cagr: number | null = null;
    if (first && last) {
      const span = last[0] - first[0];
      if (span >= 1) cagr = (Math.pow(last[1] / first[1], 1 / span) - 1) * 100;
    }
    return { hs6, latest, cagrPct: cagr };
  });
  return ok(
    result,
    [],
    failedCount > 0 ? `${failedCount}/${jobs.length} alt kategori sorgusu ölçülemedi.` : undefined,
  );
}
