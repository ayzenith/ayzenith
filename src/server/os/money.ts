import "server-only";

import { Prisma } from "@prisma/client";

/**
 * AYZENITH BUSINESS OS — money primitives.
 *
 * Every amount in the database is a Postgres `numeric` and arrives in Node as a
 * `Prisma.Decimal`. All arithmetic in the write path happens on Decimals — no
 * intermediate `Number`, ever, because a landed-cost allocation that rounds
 * through binary floating point produces a different total than the sum of its
 * parts, and that difference is exactly the kind of penny that makes an owner
 * stop trusting the system.
 *
 * `toNum` exists only at the READ boundary, where a Decimal must cross into a
 * Server Component's props (Decimal is not serialisable). Display precision is
 * two decimals; the stored value keeps four.
 */

export type Dec = Prisma.Decimal;

export const D = (v: Prisma.Decimal.Value): Dec => new Prisma.Decimal(v);
export const ZERO = () => new Prisma.Decimal(0);

/** Decimal → number, for rendering only. Never feed the result back into a write. */
export function toNum(v: Dec | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

/** Decimal → number preserving null, for optional display fields. */
export function toNumOrNull(v: Dec | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : v.toNumber();
}

/** Parse user input (a form string) into a Decimal. Accepts both "1.234,56" and
 *  "1234.56", because people paste from Excel in whichever locale they had. */
export function parseDecimal(input: unknown, fallback: Prisma.Decimal.Value = 0): Dec {
  if (input == null || input === "") return D(fallback);
  if (typeof input === "number") return Number.isFinite(input) ? D(input) : D(fallback);
  let s = String(input).trim();
  if (!s) return D(fallback);
  s = s.replace(/[\s ₺€$£]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the RIGHTMOST one is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Only commas. "1,234" is ambiguous; treat a 3-digit tail as thousands.
    const tail = s.length - lastComma - 1;
    s = tail === 3 && s.indexOf(",") !== lastComma ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  try {
    const d = new Prisma.Decimal(s);
    return d.isFinite() ? d : D(fallback);
  } catch {
    return D(fallback);
  }
}

export function parseOptionalDecimal(input: unknown): Dec | null {
  if (input == null || input === "") return null;
  const d = parseDecimal(input, Number.NaN);
  return d.isFinite() ? d : null;
}

export function parseIntOrNull(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n = Number.parseInt(String(input), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert an amount into base currency.
 *
 * `fxRate` is defined once, everywhere in this system, as: how many units of the
 * BASE currency one unit of `currency` is worth, on the day of the document. A
 * €10.000 sale at 47,20 is ₺472.000. The rate travels with the row, so a later
 * rate change never rewrites history.
 */
export function toBase(amount: Dec | null | undefined, fxRate: Dec | null | undefined): Dec {
  if (amount == null) return ZERO();
  const rate = fxRate ?? D(1);
  return amount.mul(rate);
}

/** Round to the money scale used in the ledger (4 dp). */
export function money(v: Dec): Dec {
  return v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/** Round to the quantity scale (3 dp). */
export function qty(v: Dec): Dec {
  return v.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/** Round to the unit-cost scale (6 dp) — finer than money, because a per-unit
 *  landed cost multiplied back up by the quantity must not drift. */
export function unitCost(v: Dec): Dec {
  return v.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

/** line total = qty x price x (1 − discount%). VAT is recorded, not added: the
 *  document total is the commercial figure the two parties agreed. */
export function lineTotal(quantity: Dec, unitPrice: Dec, discountRatePct: Dec): Dec {
  const factor = D(1).minus(discountRatePct.div(100));
  return money(quantity.mul(unitPrice).mul(factor));
}

export function sum(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), ZERO());
}

/** Safe division that returns null instead of Infinity/NaN. */
export function ratio(numerator: Dec, denominator: Dec): number | null {
  if (denominator.isZero()) return null;
  return numerator.div(denominator).toNumber();
}

/** Margin as a percentage of revenue, or null when there is no revenue. */
export function marginPct(profit: number, revenue: number): number | null {
  if (!revenue) return null;
  return (profit / revenue) * 100;
}
