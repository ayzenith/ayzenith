/**
 * IMPORT INTELLIGENCE — text and GTİP primitives (pure, no DB, no network).
 *
 * The official Turkish tariff files are scanned text in places: an upper-case
 * "I" regularly stands where a lower-case "l" belongs ("KulakIıkIar",
 * "DiğerIeri"). The verbatim text is always what gets SHOWN; only the search
 * form below repairs it, so matching works without ever rewriting the source.
 */

import { createHash } from "node:crypto";

const TR_MAP: Record<string, string> = { ı: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

/** "KulakIıkIar" → "Kulaklıklar": an upper-case I right after a lower-case letter is an OCR'd l. */
export function repairScannedI(s: string): string {
  return s.replace(/(?<=[a-zçğıöşü])I/g, "l");
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lower-case, strip Turkish diacritics and punctuation — the one search form. */
export function normalizeText(s: string): string {
  return repairScannedI(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[ıığüşöçâîû]/g, (c) => TR_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words that carry no product meaning in tariff text or product titles. */
const STOPWORDS = new Set([
  "ve", "veya", "ile", "icin", "olan", "olanlar", "olsun", "olmasin", "diger", "digerleri", "bu", "bir", "de", "da",
  "gibi", "haric", "dahil", "mahsus", "cinsinden", "turunden", "the", "and", "or", "of", "for", "with", "without",
  "other", "a", "an", "in", "on", "to", "by", "not", "whether", "their", "its", "than", "more", "less", "kg", "adet",
  "new", "yeni", "urun", "product", "pcs", "set", "model", "renk", "color", "colour",
]);

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Crude Turkish/English stem: drop the common plural/case endings so
 *  "kulakliklar" meets "kulaklik" and "headphones" meets "headphone". */
export function stem(t: string): string {
  if (t.length <= 4) return t;
  for (const suf of ["lerin", "larin", "leri", "lari", "ler", "lar", "sini", "sine", "nin", "si", "es", "s"]) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) return t.slice(0, -suf.length);
  }
  return t;
}

export function stems(s: string): string[] {
  return tokenize(s).map(stem);
}

// ---------------------------------------------------------------------------
// GTİP
// ---------------------------------------------------------------------------

export function gtipDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** "851830009011" → "8518.30.00.90.11"; shorter codes keep their own depth. */
export function formatGtip(code: string): string {
  const d = gtipDigits(code);
  if (d.length <= 4) return d;
  const parts = [d.slice(0, 4)];
  for (let i = 4; i < d.length; i += 2) parts.push(d.slice(i, i + 2));
  return parts.join(".");
}

export type GtipCheck =
  | { ok: true; digits: string }
  | { ok: false; digits: string; reason: string };

/** Shape check only — whether the code EXISTS is a nomenclature lookup, not this. */
export function checkGtipShape(input: string | null | undefined): GtipCheck {
  const digits = gtipDigits(input);
  if (!digits) return { ok: false, digits, reason: "GTİP girilmedi." };
  if (digits.length !== 12) {
    return { ok: false, digits, reason: `Türkiye GTİP'i 12 hanedir; girilen ${digits.length} hane.` };
  }
  const chapter = Number(digits.slice(0, 2));
  if (chapter < 1 || chapter > 99 || chapter === 77) {
    return { ok: false, digits, reason: `${digits.slice(0, 2)}. fasıl Türk tarife cetvelinde yok.` };
  }
  return { ok: true, digits };
}

/** GS1 check digit for EAN-8/UPC-A/EAN-13/GTIN-14. */
export function isValidGtin(s: string): boolean {
  const d = gtipDigits(s);
  if (![8, 12, 13, 14].includes(d.length)) return false;
  const nums = d.split("").map(Number);
  const check = nums.pop()!;
  const sum = nums
    .reverse()
    .reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
