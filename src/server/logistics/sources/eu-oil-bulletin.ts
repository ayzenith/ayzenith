import "server-only";

import ExcelJS from "exceljs";
import { db } from "@/lib/db";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — EU Weekly Oil Bulletin (first real source).
 *
 * WHAT THIS IS. The European Commission publishes weekly diesel/petrol prices
 * per member state as a small downloadable .xlsx (energy.ec.europa.eu). This
 * is an INDEX signal, never a freight price on its own — see evidence.ts and
 * estimateability.ts, where REGIONAL_INDEX_ONLY is capped at LOW precisely
 * because an index alone must never be read as a lane's actual cost.
 *
 * REAL FILE STRUCTURE (inspected directly, 2026-08-24, "Prices with taxes"
 * download — NOT guessed):
 *   Row 1: headers. Column C = "Gas oil automobile / Automotive gas oil /
 *          Dieselkraftstoff" — diesel.
 *   Row 2: column A holds the bulletin's OWN period date (e.g. 2026-08-17);
 *          the other columns hold the unit, "1000 l" for diesel.
 *   Rows 3+: column A = country name (English), column C = diesel price in
 *          EUR PER 1000 LITRES (not per litre — the row 2 unit cell says so).
 *   Trailing rows are EU-wide/Euro-area WEIGHTED AVERAGES, not countries —
 *   they are explicitly excluded by name below (a page rows-are-not-what-you-
 *   assumed check, not a code review guess).
 *
 * We use "prices with taxes" deliberately: that is what a carrier actually
 * pays at the pump, which is the real operating cost this signal exists to
 * approximate — not the pre-tax wholesale price.
 */

const BULLETIN_URL =
  "https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en?filename=Prices%20with%20taxes.xlsx";

const DIESEL_COLUMN = 3; // column C
const COUNTRY_COLUMN = 1; // column A
const FIRST_DATA_ROW = 3;

/** English bulletin name -> ISO 3166-1 alpha-2. Only the 27 member states
 *  that actually appear in this file — extending it is a one-line addition
 *  when a new name shows up, never a silent skip. */
const COUNTRY_TO_ISO2: Record<string, string> = {
  Austria: "AT", Belgium: "BE", Bulgaria: "BG", Croatia: "HR", Cyprus: "CY",
  Czechia: "CZ", Denmark: "DK", Estonia: "EE", Finland: "FI", France: "FR",
  Germany: "DE", Greece: "GR", Hungary: "HU", Ireland: "IE", Italy: "IT",
  Latvia: "LV", Lithuania: "LT", Luxembourg: "LU", Malta: "MT",
  Netherlands: "NL", Poland: "PL", Portugal: "PT", Romania: "RO",
  Slovakia: "SK", Slovenia: "SI", Spain: "ES", Sweden: "SE",
};

/** Diesel outside this range is almost certainly a parsing error (wrong
 *  column, wrong unit division), not a real weekly price. */
const PLAUSIBLE_MIN_EUR_PER_L = 0.3;
const PLAUSIBLE_MAX_EUR_PER_L = 3.5;

export type ParsedFuelRow = {
  country: string; // ISO2
  priceEurPerLiter: number;
  periodStart: Date;
  rawRow: unknown[];
};

export async function downloadOilBulletin(): Promise<Buffer> {
  const res = await fetch(BULLETIN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`EU Oil Bulletin indirilemedi: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function parseOilBulletin(buffer: Buffer): Promise<ParsedFuelRow[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's Buffer type predates Node's current typed-array-based Buffer<
  // ArrayBufferLike> — a real value works fine at runtime, this cast only
  // satisfies the stale type definition.
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("EU Oil Bulletin: beklenen çalışma sayfası bulunamadı.");

  const periodCell = sheet.getRow(2).getCell(COUNTRY_COLUMN).value;
  const periodStart = periodCell instanceof Date ? periodCell : new Date(String(periodCell));
  if (Number.isNaN(periodStart.getTime())) {
    throw new Error(`EU Oil Bulletin: dönem tarihi okunamadı (ham değer: ${String(periodCell)}).`);
  }

  const rows: ParsedFuelRow[] = [];
  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const countryName = row.getCell(COUNTRY_COLUMN).value;
    if (typeof countryName !== "string") continue;
    const iso2 = COUNTRY_TO_ISO2[countryName.trim()];
    if (!iso2) continue; // weighted-average / unknown rows are skipped, not guessed

    const dieselPer1000L = row.getCell(DIESEL_COLUMN).value;
    if (typeof dieselPer1000L !== "number") continue; // e.g. null for a country the bulletin has no diesel row for

    rows.push({
      country: iso2,
      priceEurPerLiter: dieselPer1000L / 1000,
      periodStart,
      rawRow: [countryName, dieselPer1000L],
    });
  }
  return rows;
}

export type IngestOilBulletinResult = {
  sourceId: string;
  periodStart: Date;
  parsedRows: number;
  upserted: number;
  implausible: number;
};

/**
 * Idempotent by design: the (source, country, fuelType, periodStart) unique
 * constraint means re-running this for a week already ingested UPDATES the
 * same rows rather than creating duplicates — the exact requirement that
 * motivated adding LogisticsFuelIndexObservation as its own table.
 */
export async function ingestOilBulletin(): Promise<IngestOilBulletinResult> {
  const source = await db.logisticsSource.upsert({
    where: { name: "EU Weekly Oil Bulletin" },
    create: {
      name: "EU Weekly Oil Bulletin",
      sourceType: "OFFICIAL_INDEX",
      authorityScore: 95,
      transparencyScore: 90,
      coverageScore: 85,
      historicalDepthMonths: 240,
      updateFrequency: "weekly",
      url: "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
    },
    update: { lastFetchedAt: new Date() },
  });

  const buffer = await downloadOilBulletin();
  const rows = await parseOilBulletin(buffer);
  if (rows.length === 0) {
    throw new Error("EU Oil Bulletin: dosya indirildi ama hiçbir ülke satırı ayrıştırılamadı — dosya formatı değişmiş olabilir.");
  }

  let upserted = 0;
  let implausible = 0;
  for (const row of rows) {
    const plausible = row.priceEurPerLiter >= PLAUSIBLE_MIN_EUR_PER_L && row.priceEurPerLiter <= PLAUSIBLE_MAX_EUR_PER_L;
    if (!plausible) implausible++;
    await db.logisticsFuelIndexObservation.upsert({
      where: {
        sourceId_country_fuelType_periodStart: {
          sourceId: source.id,
          country: row.country,
          fuelType: "DIESEL",
          periodStart: row.periodStart,
        },
      },
      create: {
        sourceId: source.id,
        country: row.country,
        fuelType: "DIESEL",
        priceEurPerLiter: row.priceEurPerLiter,
        periodStart: row.periodStart,
        plausible,
        plausibilityNote: plausible ? null : `${row.priceEurPerLiter} EUR/L makul aralığın (${PLAUSIBLE_MIN_EUR_PER_L}-${PLAUSIBLE_MAX_EUR_PER_L}) dışında.`,
        rawPayload: row.rawRow as object,
      },
      update: {
        priceEurPerLiter: row.priceEurPerLiter,
        plausible,
        plausibilityNote: plausible ? null : `${row.priceEurPerLiter} EUR/L makul aralığın (${PLAUSIBLE_MIN_EUR_PER_L}-${PLAUSIBLE_MAX_EUR_PER_L}) dışında.`,
        rawPayload: row.rawRow as object,
      },
    });
    upserted++;
  }

  return { sourceId: source.id, periodStart: rows[0]!.periodStart, parsedRows: rows.length, upserted, implausible };
}
