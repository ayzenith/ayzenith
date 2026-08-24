import "server-only";

import { db } from "@/lib/db";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — CNR road-freight cost index (second real
 * source, second INDEX signal, deliberately never merged with the fuel index).
 *
 * WHAT THIS IS. The Comité National Routier (CNR), France's official road
 * transport cost body, publishes a monthly, weighted, multi-component cost
 * index for a French long-haul semi-trailer truck: cnr.fr/en/espace-standard/2
 * ("Long haul semi-trailer truck - Diesel"). No login wall on this page — the
 * full monthly series (base 100 = December 2000, through the current month)
 * and the annual component weights are both directly embedded in the HTML.
 *
 * SCOPE WARNING, load-bearing. This index describes how a FRENCH-REGISTERED
 * carrier's cost structure moves — French diesel excise duty (TICPE), French
 * driver-wage regulation, French toll pricing. It is NOT a Turkish carrier's
 * cost structure and is NOT a proxy for a TR-Europe lane. `geography: "FR"`
 * on the LogisticsCostIndexDefinition row makes this explicit at the data
 * layer, not just in a comment — see the owner's explicit instruction that
 * this must never silently read as broader coverage than it has.
 *
 * REAL STRUCTURE (inspected directly from the live page's HTML, 2026-08-24 —
 * NOT guessed): each monthly value sits in
 *   <span data-indicator="ID" data-value="94.66">94.66</span>
 * with ID identifying which of 9 series it belongs to (7 weighted components
 * + 2 synthetic totals). Column order matches the header row's
 *   <th><b>MM<br/></b>YYYY</th>
 * cells, starting 01/2000. A SEPARATE table on the same page ("SYNTHETIC CNR
 * INDEX STRUCTURE") gives each component's weight per YEAR (2011 onward) —
 * confirmed to actually move over time (diesel's weight fell from 26.3% in
 * 2011 to 20.9% in 2026), which is exactly why weight has its own time axis
 * (LogisticsCostIndexComponent.effectiveYear) instead of living on every
 * monthly observation.
 *
 * `indexValue` is a base-100-relative number. It is NEVER €/km, €/ton or any
 * other unit — deliberately no field on LogisticsCostIndexObservation could
 * be mistaken for one. CNR's own "Trinomial Formula" (real figures:
 * 0.572 EUR/km, 28.23 EUR/h, 216.07 EUR/day, French-conditions cost
 * reconstruction) is NOT ingested here — it is a French carrier's OWN cost
 * model, and using it as a TR-Germany freight number would be exactly the
 * fabrication this whole system exists to prevent. It is noted in this
 * comment only, for a future methodology/audit reference, per the owner's
 * explicit decision.
 */

const CNR_URL = "https://www.cnr.fr/en/espace-standard/2";

/** CNR's internal indicator id -> this system's component vocabulary. Plain
 *  strings (see LogisticsCostIndexComponent.component doc) — this mapping is
 *  CNR-specific and does not constrain a future provider's own vocabulary. */
const INDICATOR_TO_COMPONENT: Record<string, string> = {
  "26": "DIESEL",
  "27": "MAINTENANCE",
  "28": "INFRASTRUCTURE",
  "29": "EQUIPMENT",
  "31": "DRIVER",
  "33": "ALLOWANCES",
  "58": "OVERHEADS",
  "5": "COMPOSITE",
  "15": "COMPOSITE_EX_DIESEL",
};

/** Weight-table row label (exact visible text, incl. " (%)") -> component.
 *  Deliberately excludes "Total (%)" (always 100, not a real weighted
 *  component) and the "subtotal : costs excluding diesel" row (derived,
 *  100 - diesel%, not an independent fact worth storing). */
const WEIGHT_LABEL_TO_COMPONENT: Record<string, string> = {
  "Professional diesel index (%)": "DIESEL",
  "Maintenance (%)": "MAINTENANCE",
  "Infrastructures (%)": "INFRASTRUCTURE",
  "Equipment semi-trailer truck (%)": "EQUIPMENT",
  "Long Haul driver (%)": "DRIVER",
  "Long Haul travel expenses (%)": "ALLOWANCES",
  "Long Haul semi-trailer truck overheads (%)": "OVERHEADS",
};

type Period = { month: number; year: number };

export async function downloadCnrPage(): Promise<string> {
  const res = await fetch(CNR_URL, {
    cache: "no-store",
    headers: { "user-agent": "Mozilla/5.0 (AYZENITH-Logistics/1.0)" },
  });
  if (!res.ok) throw new Error(`CNR sayfası indirilemedi: HTTP ${res.status}`);
  return res.text();
}

function parseMonthlyPeriods(html: string): Period[] {
  const re = /<b>(\d{2})<br\/?>\s*<\/b>(\d{4})<\/th>/g;
  const periods: Period[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) periods.push({ month: Number(m[1]), year: Number(m[2]) });
  return periods;
}

/** A month cell's `data-value` is sometimes the literal string "/" — CNR's own
 *  marker for "this series had not started yet" (the ex-diesel composite, for
 *  one, only begins 12/2000; the first 11 months of 2000 are "/"). Captured as
 *  `null`, at the SAME array position, so the series stays aligned with
 *  `periods` — silently skipping the cell instead would shift every later
 *  month out of alignment, exactly the kind of misalignment the length check
 *  in `parseCnrPage` exists to catch (and did, on the first real run). */
function parseIndicatorSeries(html: string, indicatorId: string): Array<number | null> {
  const re = new RegExp(`data-indicator="${indicatorId}"[^>]*data-value="([^"]*)"`, "g");
  const values: Array<number | null> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1] ?? "";
    values.push(raw === "/" || raw === "" ? null : Number(raw));
  }
  return values;
}

function parseWeightYears(html: string): number[] {
  const re = /<th>(\d{4})<\/th>/g;
  const years: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) years.push(Number(m[1]));
  return years;
}

function parseWeightRow(html: string, label: string, expectedCount: number): number[] | null {
  const idx = html.indexOf(">" + label + "<");
  if (idx === -1) return null;
  // The row's value cells follow immediately after the label cell — bounded
  // window so this can't accidentally read into the NEXT row's cells if a
  // count mismatch ever occurs (caller checks length === expectedCount).
  const chunk = html.slice(idx, idx + 4000);
  const re = /<td[^>]*>([\d.]+)<\/td>/g;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) && values.length < expectedCount) values.push(Number(m[1]));
  return values;
}

export type ParsedCnrData = {
  periods: Period[];
  series: Record<string, Array<number | null>>; // component -> monthly values (null = not yet published), same order as periods
  weightYears: number[];
  weights: Record<string, number[]>; // component -> yearly weights, same order as weightYears
};

export function parseCnrPage(html: string): ParsedCnrData {
  const periods = parseMonthlyPeriods(html);
  if (periods.length === 0) throw new Error("CNR: dönem başlıkları ayrıştırılamadı — sayfa formatı değişmiş olabilir.");

  const series: Record<string, Array<number | null>> = {};
  for (const [indicatorId, component] of Object.entries(INDICATOR_TO_COMPONENT)) {
    const values = parseIndicatorSeries(html, indicatorId);
    if (values.length !== periods.length) {
      throw new Error(
        `CNR: "${component}" serisi ${values.length} değer verdi, ${periods.length} dönem bekleniyordu — ayrıştırma güvenilmez, durduruldu.`,
      );
    }
    series[component] = values;
  }

  const weightYears = parseWeightYears(html);
  if (weightYears.length === 0) throw new Error("CNR: ağırlık tablosu yıl başlıkları bulunamadı.");

  const weights: Record<string, number[]> = {};
  for (const [label, component] of Object.entries(WEIGHT_LABEL_TO_COMPONENT)) {
    const values = parseWeightRow(html, label, weightYears.length);
    if (!values || values.length !== weightYears.length) {
      throw new Error(`CNR: "${label}" ağırlık satırı ayrıştırılamadı — sayfa formatı değişmiş olabilir.`);
    }
    weights[component] = values;
  }

  return { periods, series, weightYears, weights };
}

export type IngestCnrResult = {
  definitionId: string;
  monthsIngested: number;
  seriesIngested: number;
  weightRowsIngested: number;
};

/** Idempotent by construction, same discipline as the fuel bulletin: the
 *  unique keys (definitionId+component+effectiveYear) and
 *  (definitionId+component+periodStart) mean a re-run upserts, never
 *  duplicates. */
export async function ingestCnr(): Promise<IngestCnrResult> {
  const source = await db.logisticsSource.upsert({
    where: { name: "CNR — Comité National Routier" },
    create: {
      name: "CNR — Comité National Routier",
      sourceType: "OFFICIAL_INDEX",
      authorityScore: 90,
      transparencyScore: 85,
      coverageScore: 40, // France-domestic only — deliberately NOT scored as broad European coverage
      historicalDepthMonths: 310,
      updateFrequency: "monthly",
      url: CNR_URL,
    },
    update: { lastFetchedAt: new Date() },
  });

  const definition = await db.logisticsCostIndexDefinition.upsert({
    where: { sourceId_indexName: { sourceId: source.id, indexName: "CNR Long haul semi-trailer truck index" } },
    create: {
      sourceId: source.id,
      indexName: "CNR Long haul semi-trailer truck index",
      geography: "FR",
      vehicleType: "Semi-trailer truck ≤44t, long haul, for hire or reward",
      methodology:
        "Weighted composite of 7 cost components (diesel, maintenance, infrastructure/tolls, equipment, driver wages, travel allowances, overheads). Base 100 = 12/2000. " +
        "CNR also publishes a Trinomial Formula (cost = CK×km + CC×hours + CJ×days, e.g. 0.572 EUR/km, 28.23 EUR/h, 216.07 EUR/day as of Dec 2025) — a real French cost-reconstruction model, kept here as a methodology reference only and never ingested as data: it must never be read as a TR-Germany freight rate.",
      baseValue: 100,
      baseDate: new Date(Date.UTC(2000, 11, 1)),
    },
    update: {},
  });

  const html = await downloadCnrPage();
  const parsed = parseCnrPage(html);

  // ~2900 monthly cells + ~110 weight cells — fully sequential upserts over
  // the pooler measured at several MINUTES. Bounded concurrency (same
  // mapLimit pattern RADAR/Lead Finder already use) keeps this to seconds
  // without ever bursting the connection pool.
  async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor++]!;
        await fn(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  const observationJobs: Array<{ component: string; periodStart: Date; value: number; month: number; year: number }> = [];
  for (const [component, values] of Object.entries(parsed.series)) {
    for (let i = 0; i < parsed.periods.length; i++) {
      const value = values[i];
      if (value == null) continue; // CNR's own "/" — series hadn't started yet, never fabricate a number
      const period = parsed.periods[i]!;
      observationJobs.push({
        component,
        periodStart: new Date(Date.UTC(period.year, period.month - 1, 1)),
        value,
        month: period.month,
        year: period.year,
      });
    }
  }
  let monthsIngested = 0;
  await mapLimit(observationJobs, 12, async (job) => {
    await db.logisticsCostIndexObservation.upsert({
      where: {
        definitionId_component_periodStart: { definitionId: definition.id, component: job.component, periodStart: job.periodStart },
      },
      create: {
        definitionId: definition.id,
        component: job.component,
        periodStart: job.periodStart,
        indexValue: job.value,
        rawPayload: { component: job.component, month: job.month, year: job.year, value: job.value },
      },
      update: { indexValue: job.value },
    });
    monthsIngested++;
  });

  const weightJobs: Array<{ component: string; effectiveYear: number; weightPct: number }> = [];
  for (const [component, values] of Object.entries(parsed.weights)) {
    for (let i = 0; i < parsed.weightYears.length; i++) {
      weightJobs.push({ component, effectiveYear: parsed.weightYears[i]!, weightPct: values[i]! });
    }
  }
  let weightRowsIngested = 0;
  await mapLimit(weightJobs, 12, async (job) => {
    await db.logisticsCostIndexComponent.upsert({
      where: {
        definitionId_component_effectiveYear: { definitionId: definition.id, component: job.component, effectiveYear: job.effectiveYear },
      },
      create: { definitionId: definition.id, component: job.component, effectiveYear: job.effectiveYear, weightPct: job.weightPct },
      update: { weightPct: job.weightPct },
    });
    weightRowsIngested++;
  });
  // Synthetic totals carry no weight of their own — the weights belong to
  // their components (see schema doc). Nothing to upsert for COMPOSITE /
  // COMPOSITE_EX_DIESEL here; their `weightPct` stays null if ever created.

  return {
    definitionId: definition.id,
    monthsIngested,
    seriesIngested: Object.keys(parsed.series).length,
    weightRowsIngested,
  };
}
