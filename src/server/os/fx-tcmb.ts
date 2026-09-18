/**
 * AYZENITH BUSINESS OS — the TCMB (Türkiye Cumhuriyet Merkez Bankası) rate
 * bulletin, as pure decision logic.
 *
 * WHY THIS FILE EXISTS
 *
 * Every foreign-currency document in Business OS freezes its own `fxRate`, and
 * until now that rate came from a table someone typed in by hand — or, on the
 * expense and payment forms, from a hard-coded "1", which silently booked a USD
 * invoice as if one dollar were one lira. The central bank publishes the
 * official rates every business day at a stable, free, key-less address, so the
 * system can read them instead of trusting memory.
 *
 * What lives here is everything that can be decided without the network or the
 * database — reading the XML, choosing WHICH day's bulletin a document dated D
 * should use, and turning a published line into "base units per 1 unit". The
 * server module (`fx.ts`) does the fetching and storing around it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DECIDE
 *
 * Which rate the books must use (döviz alış vs satış, the bulletin before the
 * document date or the one on it) is an accounting decision, not a technical
 * one. Both are owner settings with a sensible default, and the pre-filled
 * value is only a suggestion the form lets you overwrite — the same rule the
 * rest of Business OS follows for tax: recorded, never computed.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

import { Prisma } from "@prisma/client";

export const TCMB_SOURCE = "TCMB";

/** The four columns TCMB publishes for every currency. */
export const FX_RATE_TYPES = ["FOREX_BUYING", "FOREX_SELLING", "BANKNOTE_BUYING", "BANKNOTE_SELLING"] as const;
export type FxRateType = (typeof FX_RATE_TYPES)[number];

export const FX_RATE_TYPE_LABELS: Record<FxRateType, string> = {
  FOREX_BUYING: "Döviz alış",
  FOREX_SELLING: "Döviz satış",
  BANKNOTE_BUYING: "Efektif alış",
  BANKNOTE_SELLING: "Efektif satış",
};

export const FX_DATE_RULES = ["PREVIOUS_BULLETIN", "SAME_DAY_BULLETIN"] as const;
export type FxDateRule = (typeof FX_DATE_RULES)[number];

export const FX_DATE_RULE_LABELS: Record<FxDateRule, string> = {
  PREVIOUS_BULLETIN: "Belge tarihinden önceki son bülten",
  SAME_DAY_BULLETIN: "Belge tarihindeki (veya önceki son) bülten",
};

export function asRateType(v: unknown): FxRateType {
  return FX_RATE_TYPES.includes(v as FxRateType) ? (v as FxRateType) : "FOREX_BUYING";
}

export function asDateRule(v: unknown): FxDateRule {
  return FX_DATE_RULES.includes(v as FxDateRule) ? (v as FxDateRule) : "PREVIOUS_BULLETIN";
}

// ---------------------------------------------------------------------------
// Dates — always the Istanbul calendar day, as "YYYY-MM-DD"
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(s: unknown): s is string {
  return typeof s === "string" && ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** The calendar day in Istanbul for an instant. A bulletin belongs to a Turkish
 *  business day, so "which day is it" must be asked in Turkey's time zone — at
 *  01:00 in Istanbul it is already tomorrow, while UTC still says today. */
export function istanbulDay(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A document date as the Istanbul day. Form dates arrive as UTC midnight of
 *  the picked day ("2026-09-18" → 2026-09-18T00:00Z), which is 03:00 the same
 *  day in Istanbul, so both paths agree on the picked day. */
export function docDay(d: Date | string): string {
  if (typeof d === "string" && isIsoDay(d)) return d;
  return istanbulDay(typeof d === "string" ? new Date(d) : d);
}

export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Saturday or Sunday: TCMB never publishes on these, so they are never asked for. */
export function isWeekend(day: string): boolean {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
}

/** The archive address of one day's bulletin, e.g. …/kurlar/202609/18092026.xml. */
export function tcmbUrl(day: string): string {
  const [y, m, d] = day.split("-");
  return `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;
}

// ---------------------------------------------------------------------------
// Reading the bulletin
// ---------------------------------------------------------------------------

export type TcmbLine = {
  currency: string;
  unit: number;
  /** Decimal strings exactly as published (TRY for `unit` units), or null when blank. */
  forexBuying: string | null;
  forexSelling: string | null;
  banknoteBuying: string | null;
  banknoteSelling: string | null;
};

export type TcmbBulletin = { day: string; bulletinNo: string | null; lines: TcmbLine[] };

const NUMBER = /^\d+(\.\d+)?$/;

function field(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`));
  const v = m?.[1]?.trim() ?? "";
  return NUMBER.test(v) && Number(v) > 0 ? v : null;
}

/**
 * Parse one TCMB bulletin. Returns null for anything that is not a bulletin —
 * the site answers a missing day with an HTML error page, and that must never be
 * mistaken for "no currencies today".
 */
export function parseTcmbXml(xml: string): TcmbBulletin | null {
  const head = xml.match(/<Tarih_Date\b[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*>/);
  if (!head) return null;
  const day = `${head[3]}-${head[2]}-${head[1]}`;
  if (!isIsoDay(day)) return null;
  const bulletinNo = head[0].match(/\bBulten_No="([^"]*)"/)?.[1] ?? null;

  const lines: TcmbLine[] = [];
  const re = /<Currency\b[^>]*\bCurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[2] ?? "";
    const unit = Number.parseInt(block.match(/<Unit>\s*(\d+)\s*<\/Unit>/)?.[1] ?? "1", 10);
    const line: TcmbLine = {
      currency: m[1]!,
      unit: Number.isFinite(unit) && unit > 0 ? unit : 1,
      forexBuying: field(block, "ForexBuying"),
      forexSelling: field(block, "ForexSelling"),
      banknoteBuying: field(block, "BanknoteBuying"),
      banknoteSelling: field(block, "BanknoteSelling"),
    };
    // XDR (IMF special drawing right) and the like carry no tradable column.
    if (line.forexBuying || line.forexSelling || line.banknoteBuying || line.banknoteSelling) lines.push(line);
  }
  return lines.length ? { day, bulletinNo, lines } : null;
}

// ---------------------------------------------------------------------------
// Choosing the bulletin and the column
// ---------------------------------------------------------------------------

/**
 * Which published bulletin a document dated `day` should use, out of the days
 * that DO have one. PREVIOUS: the latest strictly before the document date;
 * SAME_DAY: the latest on or before it. Null when nothing qualifies.
 */
export function pickBulletinDay(publishedDays: string[], day: string, rule: FxDateRule): string | null {
  let best: string | null = null;
  for (const d of publishedDays) {
    const ok = rule === "PREVIOUS_BULLETIN" ? d < day : d <= day;
    if (ok && (best === null || d > best)) best = d;
  }
  return best;
}

type RawLine = {
  unit: number;
  forexBuying: Prisma.Decimal.Value | null;
  forexSelling: Prisma.Decimal.Value | null;
  banknoteBuying: Prisma.Decimal.Value | null;
  banknoteSelling: Prisma.Decimal.Value | null;
};

const COLUMN: Record<FxRateType, keyof Omit<RawLine, "unit">> = {
  FOREX_BUYING: "forexBuying",
  FOREX_SELLING: "forexSelling",
  BANKNOTE_BUYING: "banknoteBuying",
  BANKNOTE_SELLING: "banknoteSelling",
};

/** A banknote column the bank left blank falls back to the forex column on the
 *  SAME side (buying stays buying) — never to the other side of the spread. */
const FALLBACK: Record<FxRateType, FxRateType | null> = {
  FOREX_BUYING: null,
  FOREX_SELLING: null,
  BANKNOTE_BUYING: "FOREX_BUYING",
  BANKNOTE_SELLING: "FOREX_SELLING",
};

/** TRY per ONE unit of the currency, in the requested column (with the same-side
 *  fallback), and which column was actually used. */
export function tryPerUnit(line: RawLine, type: FxRateType): { value: Prisma.Decimal; used: FxRateType } | null {
  for (let t: FxRateType | null = type; t; t = FALLBACK[t]) {
    const raw = line[COLUMN[t]];
    if (raw == null) continue;
    const v = new Prisma.Decimal(raw);
    if (!v.isFinite() || v.lte(0)) continue;
    return { value: v.div(line.unit || 1), used: t };
  }
  return null;
}

/**
 * Units of BASE currency per 1 unit of `currency` — the definition `fxRate`
 * has everywhere in Business OS. TCMB quotes everything against TRY, so for a
 * non-TRY base the rate is the cross of the two TRY quotes from the SAME
 * bulletin and column. Rounded to the 8 places the ledger stores.
 */
export function crossRate(tryPerCurrency: Prisma.Decimal, tryPerBase: Prisma.Decimal): Prisma.Decimal {
  return tryPerCurrency.div(tryPerBase).toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
}

/** What a form is told about the rate it pre-fills. Lives here, not in the
 *  server module, so client components can import the type. */
export type FxSuggestion = {
  currency: string;
  /** Units of base currency per 1 unit of `currency`, as a decimal string; null = none found. */
  rate: string | null;
  source: "BASE" | "TCMB" | "MANUAL" | "NONE";
  /** The bulletin day the rate came from (TCMB only). */
  bulletinDay: string | null;
  /** The TCMB column actually used (a blank banknote column falls back to forex). */
  rateType: FxRateType | null;
  /** The bulletin is more than a few days away from the document date — an estimate. */
  stale: boolean;
  /** One line for the form, in Turkish. */
  note: string;
};

/** More than this many calendar days between the document and its bulletin
 *  means the rate is an ESTIMATE (a future-dated document, or a gap in what
 *  could be fetched). The longest normal gap is a long holiday weekend. */
export const STALE_AFTER_DAYS = 5;
