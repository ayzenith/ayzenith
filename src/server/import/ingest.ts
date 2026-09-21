import "server-only";

import { Prisma, type ImportRuleKind } from "@prisma/client";
import { db } from "@/lib/db";
import type { SheetRows } from "./xlsx";
import {
  parseColumnRateSheet,
  parseConsolidatedAsOf,
  parseHsReference,
  parseImportCommuniquesPage,
  parseMeasuresSheet,
  parsePageDate,
  parseSafeguardSheet,
  parseTgtcSheet,
  parseUgdGroupsPage,
  type Cell,
} from "./parsers";
import { COLUMN_1_OFFICIAL_TEXT, EAGU, GYU } from "./countries";
import { normalizeText } from "./text";
import { recordSourceVersion, SOURCE_CATALOGUE, type SourceKey } from "./sources";

/**
 * IMPORT INTELLIGENCE — loading the official sources into the database.
 *
 * Run by an operator (see scripts/import-intelligence/ingest.ts), not by a web
 * request: the files are tens of megabytes and change a few times a year. Each
 * function records the source VERSION first (so every rule points at the bytes
 * it was read from) and then replaces that version's own rows — never anyone
 * else's, so an older version and the cases that cite it stay intact.
 */

export type IngestSummary = {
  key: string;
  sourceId: string;
  isNew: boolean;
  counts: Record<string, number>;
  warnings: string[];
};

const YEAR_START = (year: number) => new Date(Date.UTC(year, 0, 1));

async function replaceLines(sourceId: string, lines: Prisma.ImportTariffLineCreateManyInput[]) {
  await db.importTariffLine.deleteMany({ where: { sourceId } });
  for (let i = 0; i < lines.length; i += 1000) {
    await db.importTariffLine.createMany({ data: lines.slice(i, i + 1000), skipDuplicates: true });
  }
}

async function replaceRules(sourceId: string, rules: Prisma.ImportRuleCreateManyInput[]) {
  await db.importRule.deleteMany({ where: { sourceId } });
  for (let i = 0; i < rules.length; i += 1000) {
    await db.importRule.createMany({ data: rules.slice(i, i + 1000) });
  }
}

function cat(key: SourceKey) {
  const c = SOURCE_CATALOGUE[key];
  return { key, name: c.name, publisher: c.publisher, sourceType: c.sourceType, tier: c.tier, url: c.url };
}

// ---------------------------------------------------------------------------
// Türk Gümrük Tarife Cetveli
// ---------------------------------------------------------------------------

/** Picks the sheet that carries the tariff table (its header names the 474 ceiling). */
export function pickTgtcSheet(sheets: SheetRows[]): SheetRows | null {
  const withHeader = sheets.find((s) => s.rows.slice(0, 8).some((r) => r.some((c) => /474/.test(c.text))));
  return withHeader ?? sheets[0] ?? null;
}

export async function ingestTgtc(opts: {
  zipBytes: Uint8Array;
  chapters: Array<{ file: string; sheets: SheetRows[] }>;
  pageHtml: string | null;
  version: string;
  extractionMethod: string;
}): Promise<IngestSummary> {
  const warnings: string[] = [];
  const lines: Prisma.ImportTariffLineCreateManyInput[] = [];
  const year = Number(opts.version.slice(0, 4));
  const rec = await recordSourceVersion({
    ...cat("TR_TGTC"),
    bytes: opts.zipBytes,
    version: opts.version,
    publicationDate: opts.pageHtml ? parsePageDate(opts.pageHtml) : null,
    effectiveFrom: YEAR_START(year),
    extractionMethod: opts.extractionMethod,
    title: "İstatistik Pozisyonlarına Bölünmüş Türk Gümrük Tarife Cetveli",
    rawContent: null,
  });

  const seen = new Set<string>();
  for (const ch of opts.chapters.sort((a, b) => a.file.localeCompare(b.file))) {
    const sheet = pickTgtcSheet(ch.sheets);
    if (!sheet) {
      warnings.push(`${ch.file}: okunabilir sayfa yok`);
      continue;
    }
    const { lines: parsed, warnings: w } = parseTgtcSheet(sheet.rows, lines.length);
    warnings.push(...w.map((x) => `${ch.file}: ${x}`));
    for (const l of parsed) {
      if (seen.has(l.code)) {
        warnings.push(`${ch.file}: kod iki dosyada birden geçiyor, atlandı: ${l.code}`);
        continue;
      }
      seen.add(l.code);
      lines.push({
        sourceId: rec.id,
        system: "TR_GTIP",
        code: l.code,
        level: l.level,
        description: l.description,
        fullDescription: l.fullDescription,
        searchText: normalizeText(l.fullDescription),
        unit: l.unit,
        legalRate474: l.legalRate474 != null ? new Prisma.Decimal(l.legalRate474) : null,
        sortOrder: l.sortOrder,
      });
    }
  }
  await replaceLines(rec.id, lines);
  await db.importSource.update({
    where: { id: rec.id },
    data: { parsed: { files: opts.chapters.length, lines: lines.length, warnings: warnings.slice(0, 200) } as Prisma.InputJsonValue },
  });
  return { key: "TR_TGTC", sourceId: rec.id, isNew: rec.isNew, counts: { files: opts.chapters.length, lines: lines.length, twelveDigit: lines.filter((l) => l.level === 12).length }, warnings };
}

export async function ingestHs(opts: { bytes: Uint8Array; json: unknown }): Promise<IngestSummary> {
  const parsed = parseHsReference(opts.json as Parameters<typeof parseHsReference>[0]);
  const rec = await recordSourceVersion({
    ...cat("WCO_HS2022_UN"),
    bytes: opts.bytes,
    version: "H6 (HS 2022)",
    extractionMethod: "JSON referans listesi (aggrlevel 4 ve 6)",
    title: "HS 2022 sınıflandırma listesi",
  });
  await replaceLines(
    rec.id,
    parsed.map((l) => ({
      sourceId: rec.id,
      system: "HS",
      code: l.code,
      level: l.level,
      description: l.description,
      fullDescription: l.fullDescription,
      searchText: normalizeText(l.fullDescription),
      unit: null,
      legalRate474: null,
      sortOrder: l.sortOrder,
    })),
  );
  return { key: "WCO_HS2022_UN", sourceId: rec.id, isNew: rec.isNew, counts: { lines: parsed.length }, warnings: [] };
}

// ---------------------------------------------------------------------------
// Column-rate lists (İthalat Rejimi Kararı II Sayılı Liste, İGV Ek-1)
// ---------------------------------------------------------------------------

async function ingestColumnLists(opts: {
  key: Extract<SourceKey, "TR_IRK_II_LIST" | "TR_IGV_EK1">;
  kind: ImportRuleKind;
  zipBytes: Uint8Array;
  files: Array<{ file: string; sheets: SheetRows[] }>;
  pageHtml: string | null;
  version: string;
  legalRef: (code: string, file: string, sheet: string) => string;
  extractionMethod: string;
}): Promise<IngestSummary> {
  const warnings: string[] = [];
  const year = Number(opts.version.slice(0, 4));
  const consolidatedAsOf = opts.pageHtml ? parseConsolidatedAsOf(opts.pageHtml) : null;
  const rec = await recordSourceVersion({
    ...cat(opts.key),
    bytes: opts.zipBytes,
    version: opts.version,
    publicationDate: opts.pageHtml ? parsePageDate(opts.pageHtml) : null,
    effectiveFrom: YEAR_START(year),
    consolidatedAsOf,
    extractionMethod: opts.extractionMethod,
    rawContent: opts.pageHtml ? opts.pageHtml.length > 0 ? null : null : null,
  });

  const rules: Prisma.ImportRuleCreateManyInput[] = [];
  const seen = new Set<string>();
  for (const f of opts.files) {
    for (const sheet of f.sheets) {
      const { rules: parsed, warnings: w } = parseColumnRateSheet(sheet.rows as Cell[][]);
      if (parsed.length === 0) {
        warnings.push(`${f.file} / ${sheet.name}: sütunlu oran tablosu bulunamadı (${w[0] ?? "boş"})`);
        continue;
      }
      warnings.push(...w.slice(0, 20).map((x) => `${f.file} / ${sheet.name}: ${x}`));
      for (const r of parsed) {
        if (seen.has(r.gtip)) {
          warnings.push(`${f.file} / ${sheet.name}: GTİP birden fazla tabloda: ${r.gtip}`);
          continue;
        }
        seen.add(r.gtip);
        rules.push({
          sourceId: rec.id,
          kind: opts.kind,
          gtipPrefix: r.gtip,
          columnRates: r.columns as unknown as Prisma.InputJsonValue,
          rateType: "AD_VALOREM",
          footnote: r.footnote,
          legalRef: opts.legalRef(r.gtip, f.file, sheet.name),
          validFrom: YEAR_START(year),
          publicationDate: null,
          sourceVersion: opts.version,
          status: "IN_FORCE",
          meta: { file: f.file, sheet: sheet.name } as Prisma.InputJsonValue,
        });
      }
    }
  }
  await replaceRules(rec.id, rules);
  await db.importSource.update({
    where: { id: rec.id },
    data: { parsed: { rules: rules.length, files: opts.files.map((f) => f.file), warnings: warnings.slice(0, 200), consolidatedAsOf: consolidatedAsOf?.toISOString() ?? null } as Prisma.InputJsonValue },
  });
  return { key: opts.key, sourceId: rec.id, isNew: rec.isNew, counts: { rules: rules.length }, warnings };
}

export function ingestIrkIIList(opts: { zipBytes: Uint8Array; files: Array<{ file: string; sheets: SheetRows[] }>; pageHtml: string | null; version: string }) {
  return ingestColumnLists({
    key: "TR_IRK_II_LIST",
    kind: "CUSTOMS_DUTY",
    ...opts,
    legalRef: (code, file, sheet) => `İthalat Rejimi Kararı (Karar Sayısı: 3350) — II Sayılı Liste, ${sheet}. fasıl tablosu · GTİP ${code}`,
    extractionMethod: "ZIP → II Sayılı Liste .xlsx → exceljs (sütun 1–7 ülke grupları)",
  });
}

export function ingestIgvEk1(opts: { zipBytes: Uint8Array; files: Array<{ file: string; sheets: SheetRows[] }>; pageHtml: string | null; version: string }) {
  return ingestColumnLists({
    key: "TR_IGV_EK1",
    kind: "ADDITIONAL_DUTY",
    ...opts,
    legalRef: (code) => `İthalatta İlave Gümrük Vergisi Uygulanmasına İlişkin Karar (Karar Sayısı: 3351) — Ek-1 · GTİP ${code}`,
    extractionMethod: "ZIP → GV/EK-1.xlsx → exceljs (sütun 1–7 ülke grupları)",
  });
}

// ---------------------------------------------------------------------------
// Trade-defence measures
// ---------------------------------------------------------------------------

export async function ingestMeasures(opts: { bytes: Uint8Array; sheets: SheetRows[]; listDate: Date | null; lastModified: string | null }): Promise<IngestSummary> {
  const warnings: string[] = [];
  const rec = await recordSourceVersion({
    ...cat("TR_TRADE_DEFENCE_AD"),
    bytes: opts.bytes,
    version: opts.listDate ? opts.listDate.toISOString().slice(0, 10) : "?",
    effectiveFrom: opts.listDate,
    publicationDate: opts.listDate,
    lastModified: opts.lastModified,
    extractionMethod: "XLSX → 'Kesin Önl' ve 'Geçici Önl' sayfaları → exceljs",
  });

  const rules: Prisma.ImportRuleCreateManyInput[] = [];
  for (const [sheetName, kind] of [["Kesin Önl", "DEFINITIVE"], ["Geçici Önl", "PROVISIONAL"]] as const) {
    const sheet = opts.sheets.find((s) => s.name.includes(sheetName));
    if (!sheet) {
      warnings.push(`${sheetName} sayfası bulunamadı`);
      continue;
    }
    const { rows, warnings: w } = parseMeasuresSheet(sheet.rows as Cell[][], kind);
    warnings.push(...w.slice(0, 40));
    for (const m of rows) {
      for (const gtip of m.gtips) {
        rules.push({
          sourceId: rec.id,
          kind: /SK/i.test(m.measureType) && !/DK/i.test(m.measureType) ? "COUNTERVAILING" : "ANTI_DUMPING",
          gtipPrefix: gtip,
          originCountry: m.originCountry,
          ratePct: m.ratePct != null ? new Prisma.Decimal(m.ratePct) : null,
          rateText: m.rateText || null,
          rateType: m.rateType,
          legalRef: `İthalatta Haksız Rekabetin Önlenmesine İlişkin Tebliğ ${m.communique}${m.publishedAt ? ` (R.G. ${m.publishedAt.toISOString().slice(0, 10)})` : ""} — dosya ${m.caseNo}`,
          validFrom: m.publishedAt ?? new Date(Date.UTC(2000, 0, 1)),
          publicationDate: m.publishedAt,
          sourceVersion: opts.listDate ? opts.listDate.toISOString().slice(0, 10) : null,
          status: kind === "PROVISIONAL" ? "PROVISIONAL" : m.originCountry ? "IN_FORCE" : "NEEDS_REVIEW",
          meta: {
            caseNo: m.caseNo,
            product: m.productTr,
            productEn: m.productEn,
            countryText: m.countryText,
            countryNote: m.countryNote,
            originGroup: m.originGroup,
            measureType: m.measureType,
            normalExpiry: m.normalExpiry?.toISOString() ?? null,
            communiqueUrl: m.communiqueUrl,
            remarks: m.remarks,
          } as Prisma.InputJsonValue,
        });
      }
    }
  }
  await replaceRules(rec.id, rules);
  await db.importSource.update({ where: { id: rec.id }, data: { parsed: { rules: rules.length, warnings: warnings.slice(0, 200) } as Prisma.InputJsonValue } });
  return { key: "TR_TRADE_DEFENCE_AD", sourceId: rec.id, isNew: rec.isNew, counts: { rules: rules.length }, warnings };
}

export async function ingestSafeguards(opts: { bytes: Uint8Array; sheets: SheetRows[]; lastModified: string | null }): Promise<IngestSummary> {
  const rec = await recordSourceVersion({
    ...cat("TR_TRADE_DEFENCE_SG"),
    bytes: opts.bytes,
    version: opts.lastModified ?? "?",
    lastModified: opts.lastModified,
    extractionMethod: "XLSX → korunma önlemleri sayfası → exceljs (dosya bazında gruplanır)",
  });
  const sheet = opts.sheets[0];
  if (!sheet) return { key: "TR_TRADE_DEFENCE_SG", sourceId: rec.id, isNew: rec.isNew, counts: { rules: 0 }, warnings: ["Sayfa yok"] };
  const { cases, warnings } = parseSafeguardSheet(sheet.rows as Cell[][]);
  const rules: Prisma.ImportRuleCreateManyInput[] = [];
  for (const c of cases) {
    for (const gtip of c.gtips) {
      rules.push({
        sourceId: rec.id,
        kind: "SAFEGUARD",
        gtipPrefix: gtip,
        originCountry: c.originCountry,
        rateText: c.amounts.join(" | ") || null,
        rateType: "TEXT",
        legalRef: `Korunma önlemi — dosya ${c.caseNo}${c.phase ? ` (${c.phase})` : ""}`,
        validFrom: c.firstMeasureStart ?? new Date(Date.UTC(2000, 0, 1)),
        validUntil: c.expiry,
        sourceVersion: opts.lastModified ?? null,
        status: "IN_FORCE",
        meta: {
          caseNo: c.caseNo,
          product: c.product,
          countryText: c.countryText,
          allOrigins: !c.originCountry,
          amounts: c.amounts,
          decrees: c.decrees.map((d) => ({ ...d, date: d.date?.toISOString() ?? null })),
        } as Prisma.InputJsonValue,
      });
    }
  }
  await replaceRules(rec.id, rules);
  await db.importSource.update({ where: { id: rec.id }, data: { parsed: { cases: cases.length, rules: rules.length, warnings: warnings.slice(0, 100) } as Prisma.InputJsonValue } });
  return { key: "TR_TRADE_DEFENCE_SG", sourceId: rec.id, isNew: rec.isNew, counts: { cases: cases.length, rules: rules.length }, warnings };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function ingestUgdGroups(opts: { bytes: Uint8Array; html: string }): Promise<IngestSummary> {
  const groups = parseUgdGroupsPage(opts.html);
  const rec = await recordSourceVersion({
    ...cat("TR_UGD_GROUPS"),
    bytes: opts.bytes,
    version: parsePageDate(opts.html)?.toISOString().slice(0, 10) ?? null,
    publicationDate: parsePageDate(opts.html),
    extractionMethod: "HTML tablo satırları → tebliğ no, başlık, kapsam metni, Resmî Gazete ve rehber bağlantıları",
    status: groups.length > 0 ? "OK" : "PARSE_FAILED",
    error: groups.length > 0 ? null : "Ürün grupları tablosu ayrıştırılamadı.",
    rawContent: opts.html.length > 400_000 ? null : null,
    parsed: { groups } as unknown as Prisma.InputJsonValue,
  });
  return { key: "TR_UGD_GROUPS", sourceId: rec.id, isNew: rec.isNew, counts: { groups: groups.length }, warnings: groups.length === 0 ? ["Hiç ürün grubu ayrıştırılamadı"] : [] };
}

export async function ingestCommuniques(opts: { bytes: Uint8Array; html: string }): Promise<IngestSummary> {
  const items = parseImportCommuniquesPage(opts.html);
  const rec = await recordSourceVersion({
    ...cat("TR_IMPORT_COMMUNIQUES"),
    bytes: opts.bytes,
    version: parsePageDate(opts.html)?.toISOString().slice(0, 10) ?? null,
    publicationDate: parsePageDate(opts.html),
    extractionMethod: "HTML bağlantıları → tebliğ no ve başlık",
    status: items.length > 0 ? "OK" : "PARSE_FAILED",
    error: items.length > 0 ? null : "Tebliğ listesi ayrıştırılamadı.",
    parsed: { items } as unknown as Prisma.InputJsonValue,
  });
  return { key: "TR_IMPORT_COMMUNIQUES", sourceId: rec.id, isNew: rec.isNew, counts: { items: items.length }, warnings: [] };
}

/**
 * The general VAT rate. The GİB consolidated PDF is stored and hashed, and its
 * Article 1/1-a states "% 20" — that much was read out of the file's own text.
 * The rate's effective date (10/7/2023, Cumhurbaşkanı Kararı 7346) could NOT be
 * read from the PDF, so the rule carries it with `status: NEEDS_REVIEW` and the
 * UI shows the VAT line as partially verified, never as fully sourced.
 */
export async function ingestVatRates(opts: { bytes: Uint8Array; extracted: { generalPct: number; note: string } }): Promise<IngestSummary> {
  const rec = await recordSourceVersion({
    ...cat("TR_VAT_RATES"),
    bytes: opts.bytes,
    version: "2007/13033 konsolide",
    contentType: "application/pdf",
    extractionMethod: "PDF içerik akışlarından metin çıkarımı (kısmi: Türkçe karakterler okunamadı; Madde 1/1-a oranı okundu)",
    parsed: { generalPct: opts.extracted.generalPct, note: opts.extracted.note } as Prisma.InputJsonValue,
  });
  await replaceRules(rec.id, [
    {
      sourceId: rec.id,
      kind: "VAT",
      gtipPrefix: "",
      ratePct: new Prisma.Decimal(opts.extracted.generalPct),
      rateText: `%${opts.extracted.generalPct}`,
      rateType: "AD_VALOREM",
      legalRef: "Mal ve Hizmetlere Uygulanacak KDV Oranlarının Tespitine İlişkin Karar (2007/13033) md. 1/1-a — genel oran",
      validFrom: new Date(Date.UTC(2023, 6, 10)),
      sourceVersion: "2007/13033 konsolide",
      status: "NEEDS_REVIEW",
      meta: { note: opts.extracted.note, reducedListsChecked: false } as Prisma.InputJsonValue,
    },
  ]);
  return { key: "TR_VAT_RATES", sourceId: rec.id, isNew: rec.isNew, counts: { rules: 1 }, warnings: [opts.extracted.note] };
}

/**
 * Country groups are compiled into countries.ts from the 2026 annex; this
 * records the annex as a source and checks that every FTA / GTS country the
 * code knows is still named in the official text. A drift is a WARNING, never
 * an automatic change.
 */
export async function ingestCountryGroups(opts: { zipBytes: Uint8Array; columnHeadingsText: string; gtsCountryText: string; version: string }): Promise<IngestSummary> {
  const warnings: string[] = [];
  const official = normalizeText(opts.columnHeadingsText);
  for (const name of COLUMN_1_OFFICIAL_TEXT.split(":")[1]!.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!official.includes(normalizeText(name))) warnings.push(`Sütun 1 listesinde artık geçmiyor: ${name}`);
  }
  const gts = normalizeText(opts.gtsCountryText);
  const missing = [...GYU, ...EAGU].filter((iso) => iso.length === 2).length;
  const rec = await recordSourceVersion({
    ...cat("TR_IRK_2026_ANNEX"),
    bytes: opts.zipBytes,
    version: opts.version,
    extractionMethod: "ZIP → 'İçindekiler ve Kısaltmalar.docx' sütun başlıkları + EK-1.xlsx GTS ülke listeleri",
    rawContent: `${opts.columnHeadingsText}\n\n---\n\n${opts.gtsCountryText}`.slice(0, 40_000),
    parsed: { columnOneCountries: COLUMN_1_OFFICIAL_TEXT, gtsCountriesInCode: missing, driftWarnings: warnings } as Prisma.InputJsonValue,
    status: warnings.length > 0 ? "CHANGED" : "OK",
    error: warnings.length > 0 ? `Ülke grubu listesi değişmiş olabilir: ${warnings.join("; ")}` : null,
  });
  if (!gts.includes("gelisme yolundaki")) warnings.push("EK-1 metninde 'Gelişme Yolundaki Ülkeler' başlığı bulunamadı — dosya yapısı değişmiş olabilir.");
  return { key: "TR_IRK_2026_ANNEX", sourceId: rec.id, isNew: rec.isNew, counts: { driftWarnings: warnings.length }, warnings };
}

/** TARA can only be used by a human (it asks for a security code), so it is recorded as a link. */
export async function recordTara(): Promise<IngestSummary> {
  const rec = await recordSourceVersion({
    ...cat("TR_TARA"),
    status: "MANUAL_ONLY",
    error: "TARA güvenlik kodu (CAPTCHA) istiyor; otomatik sorgulanmıyor. Elle doğrulama bağlantısı olarak tutuluyor.",
    bytes: "TARA_MANUAL_ONLY",
    extractionMethod: "Elle doğrulama bağlantısı",
  });
  return { key: "TR_TARA", sourceId: rec.id, isNew: rec.isNew, counts: {}, warnings: [] };
}
