/**
 * PRODUCT INTELLIGENCE — reading competitor data the operator supplies (pure).
 *
 * V1 DOES NOT CRAWL MARKETPLACES. The offers come from what a person can
 * legitimately get: a block pasted out of a browser or a spreadsheet, a CSV, or
 * one product URL read elsewhere. This file turns that mess into rows.
 *
 * It is forgiving about shape and strict about meaning: a row whose price it
 * cannot read keeps a NULL price and is still counted as an offer, because the
 * listing exists whether or not we could read its number. Silently dropping it
 * would shrink a denominator somewhere, and every denominator in this module is
 * load-bearing.
 *
 * Turkish and English number formats both occur in the same paste ("1.299,90"
 * from Trendyol, "1299.90" from a spreadsheet export), so the decimal separator
 * is decided per value rather than per file.
 */

import { normalizeText } from "../import/text";
import type { Provenance } from "./types";

export type OfferDraft = {
  title: string;
  brand: string | null;
  sellerName: string | null;
  price: number | null;
  currency: string;
  ratingAvg: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  rawExcerpt: string;
  provenance: Provenance;
};

export type ParseResult = {
  rows: OfferDraft[];
  /** Rows that could not be used at all, with the reason. Shown, not hidden. */
  skipped: Array<{ line: number; text: string; reason: string }>;
  delimiter: string | null;
  headerDetected: boolean;
  notes: string[];
};

const COLUMN_ALIASES: Record<keyof Omit<OfferDraft, "currency" | "rawExcerpt" | "provenance">, string[]> = {
  title: ["baslik", "urun", "urun adi", "urunadi", "title", "name", "product", "ilan"],
  brand: ["marka", "brand"],
  sellerName: ["satici", "saticifirma", "magaza", "seller", "store", "merchant", "saticiadi"],
  price: ["fiyat", "price", "tutar", "satisfiyati", "satis fiyati"],
  ratingAvg: ["puan", "rating", "yildiz", "degerlendirmepuani", "score"],
  ratingCount: ["yorum", "yorumsayisi", "yorum sayisi", "degerlendirme", "reviews", "reviewcount", "yorumadedi"],
  sourceUrl: ["link", "url", "adres", "baglanti"],
};

/**
 * Read a money-ish string without guessing globally.
 *
 * Both separators present → the LAST one is the decimal point ("1.299,90" and
 * "1,299.90" are both 1299.9). One separator → it is a decimal point only when
 * exactly one or two digits follow it; "1.299" is one thousand two hundred and
 * ninety-nine, not 1.299.
 */
export function parseMoneyLoose(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).replace(/[^\d.,-]/g, "").trim();
  if (s === "" || s === "-") return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let cleaned: string;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const intPart = s.slice(0, decimalAt).replace(/[.,]/g, "");
    const decPart = s.slice(decimalAt + 1).replace(/[^\d]/g, "");
    cleaned = `${intPart}.${decPart}`;
  } else if (lastComma >= 0) {
    const decDigits = s.length - lastComma - 1;
    cleaned = decDigits === 1 || decDigits === 2 ? `${s.slice(0, lastComma).replace(/,/g, "")}.${s.slice(lastComma + 1)}` : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decDigits = s.length - lastDot - 1;
    cleaned = decDigits === 1 || decDigits === 2 ? s : s.replace(/\./g, "");
  } else {
    cleaned = s;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseIntLoose(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(lines: string[]): string | null {
  const candidates = ["\t", "|", ";", ","];
  let best: { d: string; score: number } | null = null;
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length - 1).filter((c) => c > 0);
    if (counts.length < Math.max(1, Math.floor(lines.length * 0.6))) continue;
    // A good delimiter splits most lines into the same number of fields.
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]!;
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 10 + mode;
    if (!best || score > best.score) best = { d, score };
  }
  return best?.d ?? null;
}

function headerIndex(cells: string[]): Partial<Record<keyof typeof COLUMN_ALIASES, number>> | null {
  const norm = cells.map((c) => normalizeText(c).replace(/\s+/g, " ").trim());
  const map: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
  let hits = 0;
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<[keyof typeof COLUMN_ALIASES, string[]]>) {
    const idx = norm.findIndex((c) => aliases.includes(c) || aliases.includes(c.replace(/\s+/g, "")));
    if (idx >= 0) {
      map[field] = idx;
      hits += 1;
    }
  }
  // A header must name the title column plus at least one more — otherwise a
  // first data row with a short product name would be eaten as a header.
  return hits >= 2 && map.title != null ? map : null;
}

const URL_RE = /https?:\/\/[^\s|;,]+/i;

export function parseOfferBlock(text: string, currency: string, provenance: Provenance = "USER_ENTERED"): ParseResult {
  const notes: string[] = [];
  const skipped: ParseResult["skipped"] = [];
  const rows: OfferDraft[] = [];

  // Lines are NOT trimmed: a leading tab is an EMPTY FIRST COLUMN, and
  // trimming it deletes that column and shifts every other one left — a row
  // with no title would then have its price read as its title. Cells are
  // trimmed individually instead, where it is safe.
  const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows, skipped, delimiter: null, headerDetected: false, notes: ["Yapıştırılan metin boş."] };
  }

  const delimiter = detectDelimiter(lines);
  if (!delimiter) {
    // One listing per line, nothing else readable. Still useful: titles alone
    // drive keywords and every facet the title states.
    notes.push("Sütun ayracı bulunamadı; her satır yalnızca başlık olarak okundu (fiyat, satıcı ve puan boş kaldı).");
    lines.forEach((raw, i) => {
      const line = raw.trim();
      const url = line.match(URL_RE)?.[0] ?? null;
      const title = line.replace(URL_RE, "").trim();
      if (title === "") {
        skipped.push({ line: i + 1, text: line, reason: "Başlık yok" });
        return;
      }
      rows.push({ title, brand: null, sellerName: null, price: null, currency, ratingAvg: null, ratingCount: null, sourceUrl: url, rawExcerpt: line, provenance });
    });
    return { rows, skipped, delimiter: null, headerDetected: false, notes };
  }

  const split = (l: string) => l.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const firstCells = split(lines[0]!);
  const header = headerIndex(firstCells);
  const body = header ? lines.slice(1) : lines;
  if (!header) {
    notes.push("Başlık satırı bulunamadı; sütunlar sırayla başlık, fiyat, satıcı, marka, puan, yorum olarak varsayıldı.");
  }

  const at = (cells: string[], field: keyof typeof COLUMN_ALIASES, positional: number): string | null => {
    const idx = header ? header[field] : positional;
    if (idx == null || idx < 0 || idx >= cells.length) return null;
    const v = cells[idx]?.trim();
    return v && v !== "" ? v : null;
  };

  body.forEach((line, i) => {
    const cells = split(line);
    const title = at(cells, "title", 0);
    if (!title) {
      skipped.push({ line: i + (header ? 2 : 1), text: line, reason: "Başlık sütunu boş" });
      return;
    }
    const urlCell = at(cells, "sourceUrl", 6) ?? line.match(URL_RE)?.[0] ?? null;
    rows.push({
      title,
      brand: at(cells, "brand", 3),
      sellerName: at(cells, "sellerName", 2),
      price: parseMoneyLoose(at(cells, "price", 1)),
      currency,
      ratingAvg: parseMoneyLoose(at(cells, "ratingAvg", 4)),
      ratingCount: parseIntLoose(at(cells, "ratingCount", 5)),
      sourceUrl: urlCell && URL_RE.test(urlCell) ? urlCell : null,
      rawExcerpt: line,
      provenance,
    });
  });

  const priced = rows.filter((r) => r.price != null).length;
  if (rows.length > 0 && priced === 0) {
    notes.push("Hiçbir satırda fiyat okunamadı. Fiyat sütununu kontrol edin — fiyat analizi bu veriyle çalışmaz.");
  }

  return { rows, skipped, delimiter, headerDetected: !!header, notes };
}
