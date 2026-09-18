import "server-only";

import { db } from "@/lib/db";
import { CURRENCY_CODES } from "@/config/os";
import { getOsSettings, type OsSettings } from "./settings";
import { D, parseOptionalDecimal, type Dec } from "./money";
import {
  TCMB_SOURCE, STALE_AFTER_DAYS, FX_RATE_TYPE_LABELS,
  addDays, crossRate, daysBetween, docDay, isWeekend, istanbulDay, parseTcmbXml, pickBulletinDay, tcmbUrl,
  tryPerUnit, type FxSuggestion, type TcmbBulletin,
} from "./fx-tcmb";

export type { FxSuggestion } from "./fx-tcmb";

/**
 * AYZENITH BUSINESS OS — official exchange rates from the TCMB, fetched on
 * demand and kept.
 *
 * There is deliberately NO cron for this. A bulletin is fetched the first time
 * any screen needs a day that has not been seen yet — opening a sale form,
 * saving an expense, importing a spreadsheet, or the "TCMB'den güncelle" button
 * in Settings — and then stored for good, together with the days that have no
 * bulletin (weekends, holidays), so the bank is never asked the same question
 * twice. That keeps it working on any hosting plan and makes a failed fetch
 * self-healing: the next screen that needs the day simply asks again.
 *
 * When the bank cannot be reached, nothing is invented: the suggestion falls
 * back to the manual table in Settings, and if that has no rate either, the
 * form asks a human to type one. It never silently becomes 1.
 */

const FETCH_TIMEOUT_MS = 8_000;
/** How far back a document looks for a bulletin before giving up on "recent". */
const LOOKBACK_DAYS = 10;

type FetchResult = TcmbBulletin | "NONE" | "ERROR";

async function fetchDay(day: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(tcmbUrl(day), {
      headers: { "User-Agent": "Mozilla/5.0 (AYZENITH Business OS)", Accept: "application/xml,text/xml" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 404) return "NONE";
    if (!res.ok) return "ERROR";
    const parsed = parseTcmbXml(await res.text());
    // A bulletin for a different day than asked is not an answer to the question.
    if (!parsed || parsed.day !== day) return "ERROR";
    return parsed;
  } catch {
    return "ERROR";
  } finally {
    clearTimeout(timer);
  }
}

async function storeDay(day: string, result: FetchResult): Promise<"OK" | "NONE" | "ERROR"> {
  if (result === "ERROR") return "ERROR";
  const date = new Date(`${day}T00:00:00Z`);
  try {
    if (result === "NONE") {
      // Today may still publish (the bank releases at 15:30), so only a day
      // that is already over can be recorded as having no bulletin.
      if (day >= istanbulDay()) return "NONE";
      await db.fxBulletin.upsert({
        where: { source_date: { source: TCMB_SOURCE, date } },
        create: { source: TCMB_SOURCE, date, status: "NONE" },
        update: {},
      });
      return "NONE";
    }
    await db.fxBulletin.upsert({
      where: { source_date: { source: TCMB_SOURCE, date } },
      create: {
        source: TCMB_SOURCE,
        date,
        status: "OK",
        bulletinNo: result.bulletinNo,
        rates: {
          create: result.lines.map((l) => ({
            currency: l.currency,
            unit: l.unit,
            forexBuying: l.forexBuying,
            forexSelling: l.forexSelling,
            banknoteBuying: l.banknoteBuying,
            banknoteSelling: l.banknoteSelling,
          })),
        },
      },
      update: {},
    });
    return "OK";
  } catch {
    // Two screens racing for the same day: the unique key lets exactly one win,
    // and the loser's answer is already stored.
    return "ERROR";
  }
}

/**
 * Make sure the bulletin a document dated `lastDay` needs is stored: walk back
 * from `lastDay` over weekdays not seen yet, fetching each, and stop at the
 * first day that has (or turns out to have) a bulletin.
 */
async function ensureLatestUpTo(lastDay: string): Promise<{ fetched: number; failed: number }> {
  const today = istanbulDay();
  const end = lastDay > today ? today : lastDay;
  const start = addDays(end, -LOOKBACK_DAYS);
  const known = await db.fxBulletin.findMany({
    where: { source: TCMB_SOURCE, date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) } },
    select: { date: true, status: true },
  });
  const status = new Map(known.map((k) => [k.date.toISOString().slice(0, 10), k.status]));

  let fetched = 0;
  let failed = 0;
  for (let d = end; d >= start; d = addDays(d, -1)) {
    if (isWeekend(d)) continue;
    const s = status.get(d);
    if (s === "OK") break;
    if (s === "NONE") continue;
    const r = await storeDay(d, await fetchDay(d));
    fetched += 1;
    if (r === "OK") break;
    if (r === "ERROR") failed += 1;
  }
  return { fetched, failed };
}

/** Refresh the last `days` days in one go (the Settings button). */
export async function syncTcmb(days = LOOKBACK_DAYS): Promise<{ ok: number; none: number; failed: number; already: number }> {
  const end = istanbulDay();
  const start = addDays(end, -days);
  const known = await db.fxBulletin.findMany({
    where: { source: TCMB_SOURCE, date: { gte: new Date(`${start}T00:00:00Z`) } },
    select: { date: true },
  });
  const have = new Set(known.map((k) => k.date.toISOString().slice(0, 10)));
  const out = { ok: 0, none: 0, failed: 0, already: 0 };
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    if (have.has(d)) { out.already += 1; continue; }
    const r = await storeDay(d, await fetchDay(d));
    if (r === "OK") out.ok += 1;
    else if (r === "NONE") out.none += 1;
    else out.failed += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

function fmtDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * The pre-fill for every currency in `currencies`, for a document dated `day`.
 * One coverage check and one read, however many currencies are asked for.
 */
export async function suggestRates(
  day: string,
  currencies: readonly string[] = CURRENCY_CODES,
  settingsIn?: OsSettings,
): Promise<Record<string, FxSuggestion>> {
  const settings = settingsIn ?? (await getOsSettings());
  const base = settings.baseCurrency;
  const rule = settings.fxDateRule;
  const type = settings.fxRateType;

  const needed = rule === "PREVIOUS_BULLETIN" ? addDays(day, -1) : day;
  try {
    await ensureLatestUpTo(needed);
  } catch {
    /* network trouble — fall through to whatever is stored */
  }

  // The newest stored bulletin the rule allows, however old: a stale real rate,
  // clearly flagged, beats no rate at all.
  const candidates = await db.fxBulletin.findMany({
    where: {
      source: TCMB_SOURCE,
      status: "OK",
      date: rule === "PREVIOUS_BULLETIN"
        ? { lt: new Date(`${day}T00:00:00Z`) }
        : { lte: new Date(`${day}T00:00:00Z`) },
    },
    orderBy: { date: "desc" },
    take: 1,
    select: { date: true },
  });
  const bulletinDay = pickBulletinDay(candidates.map((c) => c.date.toISOString().slice(0, 10)), day, rule);
  const bulletin = bulletinDay
    ? await db.fxBulletin.findUnique({
        where: { source_date: { source: TCMB_SOURCE, date: new Date(`${bulletinDay}T00:00:00Z`) } },
        select: { rates: true },
      })
    : null;
  const lines = new Map((bulletin?.rates ?? []).map((r) => [r.currency, r]));
  const stale = bulletinDay ? daysBetween(bulletinDay, day) > STALE_AFTER_DAYS : false;

  // TRY per 1 unit of the BASE currency, from the same bulletin and column.
  const tryPerBase = base === "TRY" ? { value: D(1), used: type } : (() => {
    const l = lines.get(base);
    return l ? tryPerUnit(l, type) : null;
  })();

  const out: Record<string, FxSuggestion> = {};
  for (const cur of currencies) {
    if (cur === base) {
      out[cur] = { currency: cur, rate: "1", source: "BASE", bulletinDay: null, rateType: null, stale: false, note: "Ana para birimi" };
      continue;
    }
    const tryPerCur = cur === "TRY" ? { value: D(1), used: type } : (() => {
      const l = lines.get(cur);
      return l ? tryPerUnit(l, type) : null;
    })();
    if (bulletinDay && tryPerCur && tryPerBase) {
      const used = cur === "TRY" ? tryPerBase.used : tryPerCur.used;
      const fellBack = used !== type;
      out[cur] = {
        currency: cur,
        rate: crossRate(tryPerCur.value, tryPerBase.value).toString(),
        source: "TCMB",
        bulletinDay,
        rateType: used,
        stale,
        note:
          `TCMB ${fmtDay(bulletinDay)} · ${FX_RATE_TYPE_LABELS[used]}` +
          (fellBack ? ` (${FX_RATE_TYPE_LABELS[type]} yayımlanmadı)` : "") +
          (stale ? " · tahmini, belge tarihinden eski" : ""),
      };
      continue;
    }
    const manual = settings.fxRates[cur];
    if (manual && Number.isFinite(manual) && manual > 0) {
      out[cur] = {
        currency: cur, rate: String(manual), source: "MANUAL", bulletinDay: null, rateType: null, stale: false,
        note: bulletinDay ? "TCMB bu para birimini yayımlamıyor · Ayarlar'daki elle girilen kur" : "TCMB'ye ulaşılamadı · Ayarlar'daki elle girilen kur",
      };
      continue;
    }
    out[cur] = {
      currency: cur, rate: null, source: "NONE", bulletinDay: null, rateType: null, stale: false,
      note: bulletinDay ? "TCMB bu para birimini yayımlamıyor — kuru elle girin" : "Kur bulunamadı — elle girin",
    };
  }
  return out;
}

export async function suggestRate(currency: string, day: string, settings?: OsSettings): Promise<FxSuggestion> {
  const all = await suggestRates(day, [currency], settings);
  return all[currency]!;
}

export class FxRateError extends Error {}

/**
 * The rate a WRITE should use. A rate the user typed wins; an empty one is
 * filled from the suggestion; and if there is no suggestion either, the write
 * is refused rather than booked at 1 — a USD invoice valued as if a dollar were
 * a lira is the one mistake this module exists to make impossible.
 *
 * `fxRateDate` records the bulletin day when the stored rate IS the TCMB rate,
 * so a document can later show where its rate came from.
 */
export async function resolveFxRate(input: {
  currency: string;
  date: Date | string;
  given?: unknown;
  settings?: OsSettings;
}): Promise<{ rate: Dec; fxRateDate: Date | null; suggestion: FxSuggestion | null }> {
  const settings = input.settings ?? (await getOsSettings());
  const currency = input.currency.toUpperCase();
  if (currency === settings.baseCurrency) return { rate: D(1), fxRateDate: null, suggestion: null };

  const day = docDay(input.date);
  const given = parseOptionalDecimal(input.given);
  const suggestion = await suggestRate(currency, day, settings);

  if (given && given.gt(0)) {
    const fromTcmb = suggestion.source === "TCMB" && suggestion.rate != null && given.eq(D(suggestion.rate));
    return {
      rate: given,
      fxRateDate: fromTcmb && suggestion.bulletinDay ? new Date(`${suggestion.bulletinDay}T00:00:00Z`) : null,
      suggestion,
    };
  }
  if (suggestion.rate == null) {
    throw new FxRateError(`${currency} için ${day} tarihli kur bulunamadı. Kuru elle girin veya Ayarlar'dan manuel kur ekleyin.`);
  }
  return {
    rate: D(suggestion.rate),
    fxRateDate: suggestion.bulletinDay ? new Date(`${suggestion.bulletinDay}T00:00:00Z`) : null,
    suggestion,
  };
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

export async function fxStatus(settingsIn?: OsSettings) {
  const settings = settingsIn ?? (await getOsSettings());
  const latest = await db.fxBulletin.findFirst({
    where: { source: TCMB_SOURCE, status: "OK" },
    orderBy: { date: "desc" },
    select: { date: true, bulletinNo: true, fetchedAt: true },
  });
  const today = istanbulDay();
  const rates = await suggestRates(addDays(today, 1), CURRENCY_CODES, { ...settings, fxDateRule: "PREVIOUS_BULLETIN" });
  const stored = await db.fxBulletin.count({ where: { source: TCMB_SOURCE, status: "OK" } });
  return {
    latestDay: latest ? latest.date.toISOString().slice(0, 10) : null,
    latestNo: latest?.bulletinNo ?? null,
    latestFetchedAt: latest?.fetchedAt ?? null,
    stored,
    today,
    rates,
  };
}
