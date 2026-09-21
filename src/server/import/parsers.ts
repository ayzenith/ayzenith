/**
 * IMPORT INTELLIGENCE — parsers for the official source files (pure).
 *
 * Each parser takes the cells or HTML exactly as downloaded from the publisher
 * and returns structured rows. They never fill a gap: a cell they cannot read
 * becomes `null` / a TEXT rate with the original wording, and the caller
 * records it as such. All of them are unit-tested against real rows copied
 * from the files they were written for.
 */

import { lookupCountry } from "./countries";
import { gtipDigits } from "./text";

export type Cell = { text: string; value?: unknown; numFmt?: string; hyperlink?: string };

const t = (c: Cell | undefined) => String(c?.text ?? "").replace(/\u00a0/g, " ").trim();

// ---------------------------------------------------------------------------
// Türk Gümrük Tarife Cetveli (İstatistik Pozisyonlarına Bölünmüş) — one chapter sheet
// ---------------------------------------------------------------------------

export type TgtcLine = {
  code: string;
  level: number;
  description: string;
  fullDescription: string;
  unit: string | null;
  legalRate474: number | null;
  sortOrder: number;
};

const CODE_RE = /^\d{2}\.\d{2}(\.\d{2}){0,4}$|^\d{4}(\.\d{2}){0,4}$/;

function dashDepth(text: string): number {
  const m = text.match(/^\s*((?:-\s*)+)/);
  return m ? (m[1]!.match(/-/g) ?? []).length : 0;
}

/**
 * Rows are [code, description, unit, 474 rate] as printed. Descriptions wrap
 * over several rows; an uncoded row that starts with dashes is an intermediate
 * node ("- - Diğerleri:"), one without dashes continues the row above.
 */
export function parseTgtcSheet(rows: Cell[][], startOrder = 0): { lines: TgtcLine[]; warnings: string[] } {
  type Node = { code: string | null; depth: number; text: string; unit: string | null; rate: number | null };
  const nodes: Node[] = [];
  const warnings: string[] = [];
  let started = false;
  for (const r of rows) {
    const codeRaw = t(r[0]);
    const text = t(r[1]);
    const unit = t(r[2]) || null;
    const rateCell = r[3];
    const rateText = t(rateCell);
    const rate = typeof rateCell?.value === "number" ? rateCell.value : rateText && /^\d+([.,]\d+)?$/.test(rateText) ? Number(rateText.replace(",", ".")) : null;
    const isCode = CODE_RE.test(codeRaw);
    if (!started) {
      if (!isCode) continue;
      started = true;
    }
    if (isCode) {
      const digits = gtipDigits(codeRaw);
      const depth = digits.length === 4 ? 0 : Math.max(1, dashDepth(text));
      nodes.push({ code: digits, depth, text: text.replace(/^\s*(-\s*)+/, "").trim(), unit: unit && unit !== "-" ? unit : unit, rate });
      continue;
    }
    if (!text) continue;
    if (/^\s*-/.test(text)) {
      nodes.push({ code: null, depth: dashDepth(text), text: text.replace(/^\s*(-\s*)+/, "").trim(), unit: null, rate: null });
      continue;
    }
    const last = nodes[nodes.length - 1];
    if (!last) continue;
    last.text = `${last.text} ${text}`.replace(/\s+/g, " ").trim();
    if (last.unit == null && unit) last.unit = unit;
    if (last.rate == null && rate != null) last.rate = rate;
  }

  const lines: TgtcLine[] = [];
  const stack: Node[] = [];
  const seen = new Set<string>();
  let order = startOrder;
  for (const n of nodes) {
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= n.depth) stack.pop();
    stack.push(n);
    if (!n.code) continue;
    if (seen.has(n.code)) {
      warnings.push(`Tekrarlanan kod atlandı: ${n.code}`);
      continue;
    }
    seen.add(n.code);
    lines.push({
      code: n.code,
      level: n.code.length,
      description: n.text,
      fullDescription: stack.map((s) => s.text).join(" › "),
      unit: n.unit && n.unit !== "-" ? n.unit : null,
      legalRate474: n.rate,
      sortOrder: order++,
    });
  }
  return { lines, warnings };
}

// ---------------------------------------------------------------------------
// Rate cells (İthalat Rejimi Kararı lists, İGV tables)
// ---------------------------------------------------------------------------

export type RateCell = { pct: number | null; text: string; type: "AD_VALOREM" | "COMPOUND" | "SPECIFIC" | "TEXT" | "EMPTY"; footnote: string | null };

export function parseRateCell(c: Cell | undefined): RateCell {
  const text = t(c).replace(/\s+/g, " ");
  if (!text) return { pct: null, text: "", type: "EMPTY", footnote: null };
  if (/eur|usd|\$|€|kg|adet|min|max|lt|ton/i.test(text)) {
    return { pct: null, text, type: /min|max|\+/i.test(text) ? "COMPOUND" : "SPECIFIC", footnote: null };
  }
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:\((\w+)\))?$/);
  if (m) return { pct: Number(m[1]!.replace(",", ".")), text, type: "AD_VALOREM", footnote: m[2] ?? null };
  return { pct: null, text, type: "TEXT", footnote: null };
}

export type ColumnRule = { gtip: string; footnote: string | null; columns: Record<string, RateCell> };

/**
 * II Sayılı Liste / İGV Ek-1 sheet: [GTİP, DİPNOT, col1 … col7]. The header is
 * located by its "GTİP" + "DİPNOT" cells and the 1…7 row under it; data rows
 * are the ones whose first cell is a 12-digit code.
 */
export function parseColumnRateSheet(rows: Cell[][]): { rules: ColumnRule[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => /G\.?T\.?İ\.?P/i.test(t(r[0])) && /D[İI]PNOT/i.test(t(r[1])));
  if (headerIdx < 0) return { rules: [], warnings: ["Başlık satırı (GTİP / DİPNOT) bulunamadı."] };
  const numberRow = rows.slice(headerIdx, headerIdx + 4).find((r) => t(r[2]) === "1" && t(r[8]) === "7");
  if (!numberRow) warnings.push("Sütun numaraları (1…7) satırı bulunamadı; sütun sırası başlıktan varsayılmadı.");
  const rules: ColumnRule[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(headerIdx + 1)) {
    const code = gtipDigits(t(r[0]));
    if (code.length !== 12) continue;
    if (!numberRow) continue;
    if (seen.has(code)) {
      warnings.push(`Tekrarlanan GTİP: ${code}`);
      continue;
    }
    seen.add(code);
    const columns: Record<string, RateCell> = {};
    for (let i = 1; i <= 7; i += 1) columns[String(i)] = parseRateCell(r[i + 1]);
    rules.push({ gtip: code, footnote: t(r[1]) || null, columns });
  }
  return { rules, warnings };
}

// ---------------------------------------------------------------------------
// Anti-dumping / countervailing — "Yürürlükteki Önlemler" (definitive + provisional)
// ---------------------------------------------------------------------------

export type MeasureRow = {
  caseNo: string;
  productTr: string;
  productEn: string;
  gtips: string[];
  countryText: string;
  originCountry: string | null;
  originGroup: "EU" | null;
  countryNote: string | null;
  communique: string;
  communiqueUrl: string | null;
  publishedAt: Date | null;
  rateText: string;
  ratePct: number | null;
  rateType: "AD_VALOREM" | "RANGE" | "SPECIFIC" | "TEXT";
  measureType: string;
  normalExpiry: Date | null;
  remarks: string | null;
};

function asDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string") {
    const m = v.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  }
  return null;
}

export function splitGtips(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.split(/[\s,;/]+/)) {
    const d = gtipDigits(tok);
    if (d.length >= 4 && d.length <= 12 && d.length % 2 === 0) out.push(d);
  }
  return [...new Set(out)];
}

export function parseMeasureRate(c: Cell | undefined): { pct: number | null; type: MeasureRow["rateType"]; text: string } {
  const text = t(c).replace(/\s+/g, " ");
  if (typeof c?.value === "number" && (c.numFmt ?? "").includes("%")) {
    const pct = Math.round(c.value * 1_000_000) / 10_000;
    return { pct, type: "AD_VALOREM", text: text || `%${pct}` };
  }
  if (!text || text === "-") return { pct: null, type: "TEXT", text };
  if (/\$|€|usd|eur|abd dolar/i.test(text)) return { pct: null, type: "SPECIFIC", text };
  const nums = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1]!.replace(",", ".")));
  if (nums.length === 1 && /%/.test(text)) return { pct: nums[0]!, type: "AD_VALOREM", text };
  if (nums.length >= 2 && /%/.test(text)) return { pct: null, type: "RANGE", text };
  return { pct: null, type: "TEXT", text };
}

function resolveMeasureCountry(tr: string, en: string): { iso: string | null; group: "EU" | null; note: string | null } {
  const all = `${tr} ${en}`;
  if (/avrupa birli|european union|^ab\b|\bab \(|eu \(/i.test(all)) {
    return { iso: null, group: "EU", note: /hari[cç]|except/i.test(all) ? tr : null };
  }
  const firm = /yerle[sş]ik|firmalar/i.test(tr) ? tr : null;
  const iso = lookupCountry(en) ?? lookupCountry(tr);
  return { iso, group: null, note: firm };
}

export function parseMeasuresSheet(rows: Cell[][], kind: "DEFINITIVE" | "PROVISIONAL"): { rows: MeasureRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => t(r[0]) === "DOSYA NO");
  if (headerIdx < 0) return { rows: [], warnings: ["Başlık satırı (DOSYA NO) bulunamadı."] };
  const header = rows[headerIdx]!.map((c) => t(c));
  const col = (re: RegExp, from = 0) => header.findIndex((h, i) => i >= from && re.test(h));
  const cGtip = col(/G\.T\.İ\.P/);
  const cRate = col(/ORANI/);
  const cType = col(/TÜRÜ/);
  const cComm = col(/TEBLİĞ NO/);
  const cDate = col(/RG TARİHİ/);
  const cExpiry = col(/SÜRE DOLUM/);
  const cRemarks = header.findIndex((h) => /İLAVE AÇIKLAMALAR/.test(h));
  const out: MeasureRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const caseNo = t(r[0]);
    if (!/^[A-ZÇĞİÖŞÜ]{2,4}\.\d/.test(caseNo)) continue;
    const gtips = splitGtips(t(r[cGtip]));
    if (gtips.length === 0) {
      warnings.push(`${caseNo}: GTİP okunamadı ("${t(r[cGtip])}")`);
      continue;
    }
    const countryTr = t(r[5]);
    const countryEn = t(r[6]);
    const country = resolveMeasureCountry(countryTr, countryEn);
    if (!country.iso && !country.group) warnings.push(`${caseNo}: ülke eşlenemedi ("${countryTr} / ${countryEn}")`);
    const rate = parseMeasureRate(r[cRate]);
    out.push({
      caseNo,
      productTr: t(r[2]),
      productEn: t(r[3]),
      gtips,
      countryText: `${countryTr} / ${countryEn}`.trim(),
      originCountry: country.iso,
      originGroup: country.group,
      countryNote: country.note,
      communique: t(r[cComm]),
      communiqueUrl: r[cComm]?.hyperlink ?? null,
      publishedAt: asDate(r[cDate]?.value) ?? asDate(t(r[cDate])),
      rateText: rate.text,
      ratePct: rate.pct,
      rateType: rate.type,
      measureType: `${kind === "PROVISIONAL" ? "GEÇİCİ " : ""}${t(r[cType])}`.trim(),
      normalExpiry: cExpiry >= 0 ? asDate(r[cExpiry]?.value) ?? asDate(t(r[cExpiry])) : null,
      remarks: cRemarks >= 0 ? r.slice(cRemarks).map((c) => t(c)).filter(Boolean).join(" ") || null : null,
    });
  }
  return { rows: out, warnings };
}

// ---------------------------------------------------------------------------
// Safeguard measures in force
// ---------------------------------------------------------------------------

export type SafeguardCase = {
  caseNo: string;
  product: string;
  gtips: string[];
  countryText: string;
  originCountry: string | null;
  firstMeasureStart: Date | null;
  expiry: Date | null;
  phase: string;
  amounts: string[];
  decrees: Array<{ type: string; no: string; url: string | null; date: Date | null }>;
};

export function parseSafeguardSheet(rows: Cell[][]): { cases: SafeguardCase[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => r.some((c) => /DOSYA \/CASE NO/i.test(t(c))));
  if (headerIdx < 0) return { cases: [], warnings: ["Başlık satırı bulunamadı."] };
  const header = rows[headerIdx]!.map((c) => t(c));
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cCase = idx(/DOSYA/);
  const cName = idx(/MADDE/);
  const cGtip = idx(/GTİP/);
  const cCountry = idx(/ÜLKE/);
  const cType = idx(/TÜRÜ/);
  const cDecree = cType + 1;
  const cRgNo = cType + 2;
  const cRgDate = cType + 3;
  const cPhase = idx(/İLK ÖNLEM \/UZATMA/);
  const cStart = idx(/BAŞLANGIÇ/);
  const cEnd = idx(/BİTİŞ/);
  const cAmount = idx(/MİKTARI/);
  const byCase = new Map<string, SafeguardCase>();
  for (const r of rows.slice(headerIdx + 2)) {
    const caseNo = t(r[cCase]);
    if (!caseNo || !/\d/.test(caseNo)) continue;
    let sc = byCase.get(caseNo);
    if (!sc) {
      const countryText = t(r[cCountry]);
      sc = {
        caseNo,
        product: t(r[cName]).replace(/\s+/g, " "),
        gtips: splitGtips(t(r[cGtip])),
        countryText,
        originCountry: lookupCountry(countryText.split("/")[1]?.trim() ?? "") ?? lookupCountry(countryText.split("/")[0]?.trim() ?? ""),
        firstMeasureStart: asDate(r[cStart]?.value) ?? asDate(t(r[cStart])),
        expiry: asDate(r[cEnd]?.value) ?? asDate(t(r[cEnd])),
        phase: t(r[cPhase]),
        amounts: [],
        decrees: [],
      };
      byCase.set(caseNo, sc);
      if (sc.gtips.length === 0) warnings.push(`${caseNo}: GTİP okunamadı`);
    }
    const amount = t(r[cAmount]);
    if (amount && amount !== "-" && !sc.amounts.includes(amount)) sc.amounts.push(amount.replace(/\s+/g, " "));
    sc.decrees.push({
      type: t(r[cType]),
      no: t(r[cDecree]),
      url: r[cRgNo]?.hyperlink ?? null,
      date: asDate(r[cRgDate]?.value) ?? asDate(t(r[cRgDate])),
    });
  }
  return { cases: [...byCase.values()], warnings };
}

// ---------------------------------------------------------------------------
// HTML pages
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export type UgdGroup = { no: string; group: string; title: string; scope: string; rgUrl: string | null; guideUrl: string | null };

/** "İthalatta Denetimi Gerçekleştirilen Ürün Grupları" — one table row per communiqué. */
export function parseUgdGroupsPage(html: string): UgdGroup[] {
  const start = html.indexOf('class="__content"');
  const end = start >= 0 ? html.indexOf("</table>", start) : -1;
  if (start < 0 || end < 0) return [];
  const out: UgdGroup[] = [];
  for (const row of html.slice(start, end).split(/<tr>/i).slice(1)) {
    const text = decodeEntities(row.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const no = text.match(/\(Ürün Güvenliği ve Denetimi:\s*(\d{4}\/\d+)\)/)?.[1];
    if (!no) continue;
    const anchors = [...row.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
      url: decodeEntities(m[1]!),
      text: decodeEntities(m[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
    }));
    const rg = anchors.find((a) => /Ürün Güvenliği ve Denetimi/.test(a.text) || /resmigazete/.test(a.url));
    const guide = anchors.find((a) => /Rehber/i.test(a.url));
    const idxTitleEnd = text.indexOf(`(Ürün Güvenliği ve Denetimi: ${no})`);
    const head = text.slice(0, idxTitleEnd).trim();
    const dash = head.search(/\s-\s|-\s/);
    const group = dash > 0 ? head.slice(0, dash).trim() : "";
    const title = (rg?.text ?? head.slice(dash + 1)).replace(/\s*-\s*$/, "").trim();
    const scope = text
      .slice(idxTitleEnd + `(Ürün Güvenliği ve Denetimi: ${no})`.length)
      .replace(/Denetim rehberine ulaşmak için\s*tıklayınız\s*\.?/gi, "")
      .trim();
    out.push({ no, group, title, scope, rgUrl: rg?.url ?? null, guideUrl: guide?.url ?? null });
  }
  return out;
}

export type ImportCommunique = { no: string; title: string; url: string | null };

/** "İthalat Tebliğleri (2026 Yılı)" — the special import regimes (permits, bans). */
export function parseImportCommuniquesPage(html: string): ImportCommunique[] {
  const out: ImportCommunique[] = [];
  for (const m of html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = decodeEntities(m[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/^[–-]+\s*/, "").trim();
    const no = title.match(/\(İthalat:\s*(\d{4}\/\d+)\)/)?.[1];
    if (!no) continue;
    if (out.some((o) => o.no === no && o.title === title)) continue;
    out.push({ no, title, url: decodeEntities(m[1]!) });
  }
  return out;
}

/** A consolidated decision page lists every amending Official Gazette; the last date is the consolidation point. */
export function parseConsolidatedAsOf(html: string): Date | null {
  const text = htmlToText(html);
  const k = text.search(/Değişiklik Yapan Kararların Yayımlandığı/);
  if (k < 0) return null;
  let last: Date | null = null;
  for (const m of text.slice(k).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    if (!last || d > last) last = d;
  }
  return last;
}

/** The ministry page's own date line ("17 Temmuz 2026"). */
export function parsePageDate(html: string): Date | null {
  const months = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
  const m = htmlToText(html).match(/(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), months.indexOf(m[2]!.toLocaleLowerCase("tr")), Number(m[1])));
}

// ---------------------------------------------------------------------------
// WCO HS 2022 (UN Comtrade reference list H6)
// ---------------------------------------------------------------------------

export type HsLine = { code: string; level: number; description: string; fullDescription: string; sortOrder: number };

export function parseHsReference(json: { results?: Array<{ id: string; text: string; parent: string; aggrLevel?: number; aggrlevel?: number }> }): HsLine[] {
  // The H6 (HS 2022) file spells the level "aggrlevel", the combined file "aggrLevel".
  const rows = (json.results ?? []).map((r) => ({ ...r, aggrLevel: r.aggrLevel ?? r.aggrlevel ?? 0 }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const strip = (r: { id: string; text: string }) => r.text.replace(new RegExp(`^${r.id}\\s*-\\s*`), "").trim();
  const out: HsLine[] = [];
  let order = 0;
  for (const r of rows) {
    if (r.aggrLevel !== 4 && r.aggrLevel !== 6) continue;
    if (!/^\d+$/.test(r.id)) continue;
    const parent = byId.get(r.parent);
    const own = strip(r);
    out.push({
      code: r.id,
      level: r.aggrLevel,
      description: own,
      fullDescription: r.aggrLevel === 6 && parent ? `${strip(parent)} › ${own}` : own,
      sortOrder: order++,
    });
  }
  return out;
}
