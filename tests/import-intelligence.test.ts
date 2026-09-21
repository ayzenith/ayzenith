import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAttributes, parseComposition, type TextSource } from "../src/server/import/attributes";
import { buildNomenclatureIndex, classify } from "../src/server/import/classify";
import { phraseAt } from "../src/server/import/concepts";
import { checkCompliance } from "../src/server/import/compliance";
import { lookupCountry, originColumn } from "../src/server/import/countries";
import { computeLandedCost } from "../src/server/import/landed";
import { decideOrigin } from "../src/server/import/origin";
import {
  parseColumnRateSheet, parseConsolidatedAsOf, parseMeasureRate, parseMeasuresSheet, parseRateCell,
  parseTgtcSheet, parseUgdGroupsPage, splitGtips, type Cell,
} from "../src/server/import/parsers";
import { resolveRule, type RuleLike } from "../src/server/import/rules";
import { computeTaxes, type ColumnRuleData, type MeasureRuleData, type TaxInput, type VatRuleData } from "../src/server/import/tax";
import { checkGtipShape, formatGtip, isValidGtin, normalizeText } from "../src/server/import/text";
import { extractWebProduct, looksLikeManufacturerDomain } from "../src/server/import/webextract";

// ---------------------------------------------------------------------------
// Fixtures — rows copied from the real official files (2026 TGTC, II Sayılı
// Liste, İGV Ek-1, "Yürürlükteki Önlemler 13.07.2026").
// ---------------------------------------------------------------------------

const C = (...cells: Array<string | number | null>): Cell[] => cells.map((c) => ({ text: c == null ? "" : String(c), value: c }));

const TGTC_ROWS: Cell[][] = [
  C(null, null, "ÖLÇÜ BİRİMİ", "474 VERGİ HADDİ"),
  C("POZİSYON NO", "EŞYANIN TANIMI", "ÖLÇÜ BİRİMİ", "474 VERGİ HADDİ"),
  C("1", "2", 3, 4),
  C(" 85.17", " Telefon cihazları (hücresel ağlar için veya diğer kablosuz ağlar için"),
  C(null, "  olan akıllı telefonlar ve diğer telefonlar dahil); ses, görüntü veya diğer bilgileri"),
  C(null, " almaya veya vermeye  mahsus diğer cihazlar"),
  C(null, " - Telefon cihazları (hücresel ağlar için veya diğer kablosuz ağlar için"),
  C(null, "    olan akıllı telefonlar ve diğer telefonlar dahil)"),
  C("8517.13", " - - Akıllı telefonlar:"),
  C("8517.13.00.00.11", " - - - Akıllı saatler (8517.62 alt pozisyonundakiler hariç)", "Adet", 30),
  C("8517.13.00.00.19", " - - - Diğerleri", "Adet", 30),
  C(null, "  - Ses, görüntü veya diğer bilgileri almaya veya vermeye mahsus"),
  C(null, "   diğer cihazlar:"),
  C("8517.62.00", " - - Ses, görüntü veya diğer bilgileri almaya,çevirmeye ve vermeye veya "),
  C(null, "    yeniden oluşturmaya mahsus makinalar"),
  C("8517.62.00.10.00", " - - - Hücresel ağ  için olanlar", "-", 50),
  C("8517.62.00.90.00", " - - - Diğerleri:", "-", 30),
  C("85.18", "Mikrofonlar ve bunların mesnetleri; hoparlörler (kabinlerine monte "),
  C(null, "edilmiş olsun olmasın); başa takılan kulaklıklar, kulağa takılan"),
  C(null, "kulaklıklar( bir mikrofonla kombine halde olsun olmasın):"),
  C("8518.10.00.00.00", " - Mikrofonlar ve bunların mesnetleri", "-", 30),
  C(null, " - Hoparlörler (kabinlerine monte edilmiş olsun olmasın):", " "),
  C("8518.21.00.00.00", " - - Kabinine monte edilmiş tek hoparlör", "Adet", 40),
  C("8518.22.00.00.00", " - - Aynı kabine monte ediImiş birden fazIa hoparlörIer", "Adet", 40),
  C("8518.30", " - Başa takıIan kulakIıkIar, kulağa takıIan kuIaklıklar (bir mikrofonla "),
  C(null, "   kombine halde olsun olmasın):"),
  C("8518.30.00.10.00", " - - Sivil hava taşıtlarında kullanılmaya mahsus olanlar", "-", 30),
  C("8518.30.00.90.00", " - - Diğerleri", "-", 50),
  C("8518.90", " - Aksam ve parçalar:"),
  C("8518.90.00.90.00", " - - DiğerIeri", "-", 50),
  C("61.09", "Tişörtler, fanilalar, atletler, kaşkorseler ve diğer iç giyim"),
  C(null, "eşyası (örme veya kroşe) :"),
  C("6109.10.00.00.00", " - Pamuktan ", "Adet", 100),
  C("6109.90", " - Dokumaya elverişli diğer maddelerden:"),
  C(null, " - - Yünden, ince hayvan kıllarından, sentetik veya suni liflerden :"),
  C("6109.90.20.00.11", " - - - Yünden, ince hayvan kıllarından", "Adet", 100),
  C("6109.90.20.00.12", " - - - Sentetik veya suni liflerden ", "Adet", 100),
  C("6109.90.90.00.00", " - - Diğerleri ", "Adet", 100),
];

const HS = [
  { code: "851830", level: 6, description: "Headphones and earphones, whether or not combined with a microphone", fullDescription: "Microphones; loudspeakers; headphones › Headphones and earphones, whether or not combined with a microphone" },
  { code: "851762", level: 6, description: "Machines for the reception, conversion and transmission of voice, images or other data", fullDescription: "Telephone sets › Machines for the reception, conversion and transmission of voice, images or other data" },
  { code: "610910", level: 6, description: "T-shirts, singlets and other vests; of cotton, knitted or crocheted", fullDescription: "T-shirts › of cotton, knitted" },
];

const { lines: TGTC } = parseTgtcSheet(TGTC_ROWS);
const INDEX = buildNomenclatureIndex({ sourceKey: "TR_TGTC", version: "2026", tr: TGTC, hs: HS });

const attrs = (name: string, text = "", extra: Partial<Parameters<typeof extractAttributes>[0]> = {}) =>
  extractAttributes({ name, ...extra }, text ? [{ text, provenance: "USER_ENTERED", from: "Açıklama" } satisfies TextSource] : []);

// ---------------------------------------------------------------------------
// Text / GTİP primitives
// ---------------------------------------------------------------------------

test("scanned 'I' for 'l' is repaired only for matching, not for display", () => {
  assert.equal(normalizeText("Başa takıIan kulakIıkIar"), "basa takilan kulakliklar");
  assert.equal(normalizeText("DiğerIeri"), "digerleri");
  const line = TGTC.find((l) => l.code === "851830");
  assert.match(line!.description, /takıIan/);
});

test("GTİP shape: 12 digits required, invalid chapter refused", () => {
  assert.equal(checkGtipShape("8518.30.00.90.00").ok, true);
  assert.equal(checkGtipShape("851830").ok, false);
  assert.equal(checkGtipShape("770000000000").ok, false);
  assert.equal(formatGtip("851830009011"), "8518.30.00.90.11");
});

test("EAN/GTIN check digit", () => {
  assert.equal(isValidGtin("4006381333931"), true);
  assert.equal(isValidGtin("4006381333932"), false);
});

// ---------------------------------------------------------------------------
// Parsers (real rows)
// ---------------------------------------------------------------------------

test("TGTC parser builds the hierarchy from dash depth and wrapped rows", () => {
  const smartwatch = TGTC.find((l) => l.code === "851713000011")!;
  assert.equal(smartwatch.level, 12);
  assert.equal(smartwatch.unit, "Adet");
  assert.equal(smartwatch.legalRate474, 30);
  assert.match(smartwatch.fullDescription, /^Telefon cihazları .* › Telefon cihazları .* › Akıllı telefonlar: › Akıllı saatler/);
  const synthetic = TGTC.find((l) => l.code === "610990200012")!;
  assert.match(synthetic.fullDescription, /Dokumaya elverişli diğer maddelerden: › Yünden, ince hayvan kıllarından, sentetik veya suni liflerden : › Sentetik/);
  assert.ok(TGTC.find((l) => l.code === "8518"), "4-digit heading kept");
});

test("II Sayılı Liste rate cells: plain, footnoted, compound", () => {
  assert.deepEqual(parseRateCell({ text: "2" }), { pct: 2, text: "2", type: "AD_VALOREM", footnote: null });
  assert.equal(parseRateCell({ text: "1,5(2)" }).pct, 1.5);
  assert.equal(parseRateCell({ text: "1,5(2)" }).footnote, "2");
  const compound = parseRateCell({ text: "4,5\nMIN 0,3 EUR\nAdet\nMAX 0,8 EUR\nAdet" });
  assert.equal(compound.type, "COMPOUND");
  assert.equal(compound.pct, null, "a compound rate is never squeezed into a percentage");
});

test("column-rate sheet (II Sayılı Liste / İGV Ek-1 layout)", () => {
  const rows: Cell[][] = [
    C("85. FASIL"),
    C("GTİP", "DİPNOT", "GÜMRÜK VERGİSİ ORANI (%) "),
    C("GTİP", "DİPNOT", 1, 2, 3, "GTS ÜLKELERİ", "GTS ÜLKELERİ", "GTS ÜLKELERİ", 7),
    C("GTİP", "DİPNOT", 1, 2, 3, 4, 5, 6, 7),
    C("851830009011", null, 0, 0, 0, 0, 0, 0, 2),
    C("851830009019", null, 0, 0, 0, 0, 0, 0, 2),
    C("851771000000", "(b)", 0, "5(2)", 0, 0, 0, "1,5(2)", "5(2)"),
  ];
  const { rules } = parseColumnRateSheet(rows);
  assert.equal(rules.length, 3);
  assert.equal(rules[0]!.columns["7"]!.pct, 2);
  assert.equal(rules[0]!.columns["1"]!.pct, 0);
  assert.equal(rules[2]!.footnote, "(b)");
});

test("trade-defence rates: single %, firm range, per-unit", () => {
  assert.deepEqual(parseMeasureRate({ text: "34%", value: 0.3427, numFmt: "0.00%" }).pct, 34.27);
  assert.equal(parseMeasureRate({ text: "%38,26-%45,99" }).type, "RANGE");
  assert.equal(parseMeasureRate({ text: "29-154 $/adet" }).type, "SPECIFIC");
  assert.deepEqual(splitGtips("7019.11  7019.12\n7019.13"), ["701911", "701912", "701913"]);
});

test("measures sheet: country resolved from full official names, EU group kept as a group", () => {
  const header = C("DOSYA NO", "SEKTÖR", "MADDE İSMİ", "MADDE İSMİ", "G.T.İ.P. ", "ÜLKE", "ÜLKE", "ÖNLEM TEBLİĞ NO", "ÖNLEM RG TARİHİ", "ÖNLEM RG NO", "BİLGİLENDİRME RAPORU", "ÖNLEM ORANI (CIF%) / MİKTARI", " ÖNLEM TÜRÜ", "NORMAL SÜRE DOLUM TARİHİ");
  const rows: Cell[][] = [
    header,
    C("NGS.233.01.2020", "MK", "Kaynak Makinaları", "Welding Machines", "8515.39", "Çin Halk Cumhuriyeti", "China, P.R.", "2021/19", "22.05.2021", "31488", null, "29-154 $/adet", "DK", "22.05.2026"),
    C("OEK.147.07.2023", "TK", "Mensucat", "Woven Fabrics", "54.07", "Hırvatistan Cumhuriyeti", "Republic of Croatia", "2024/8", "20.02.2024", "32466", null, "%21,13-%42,44", "DK (ÖK)", null),
    C("DMS.100.00.2020", "TK", "Ürün", "Product", "5503.20", "AB (İspanya hariç olmak üzere)", "EU (except Spain)", "2020/1", "01.01.2020", "1", null, "%10", "DK", null),
  ];
  const { rows: out, warnings } = parseMeasuresSheet(rows, "DEFINITIVE");
  assert.equal(warnings.length, 0);
  assert.equal(out[0]!.originCountry, "CN");
  assert.equal(out[1]!.originCountry, "HR");
  assert.equal(out[2]!.originGroup, "EU");
  assert.ok(out[2]!.countryNote?.includes("İspanya"));
  assert.equal(lookupCountry("Kingdom of Holland."), "NL");
});

test("ÜGD groups page and consolidated date parse from the ministry's HTML", () => {
  const html = `<div class="__content"><table><tbody><tr><td><strong>Telsiz ve Telekomünikasyon Terminal Ekipmanları - <a href="https://www.resmigazete.gov.tr/x.pdf">Telsiz ve Telekomünikasyon Terminal Ekipmanlarının İthalat Denetimi Tebliği (Ürün Güvenliği ve Denetimi: 2026/8)</a></strong><div>Akıllı Saatler, Bluetooth Kulaklıklar vb. ürünler. Denetim rehberine ulaşmak için <a href="https://ticaret.gov.tr/Rehberler/8.pdf">tıklayınız</a>.</div></td></tr></tbody></table>`;
  const groups = parseUgdGroupsPage(html);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.no, "2026/8");
  assert.match(groups[0]!.scope, /Bluetooth Kulaklıklar/);
  assert.equal(groups[0]!.rgUrl, "https://www.resmigazete.gov.tr/x.pdf");
  const d = parseConsolidatedAsOf("<p>Cumhurbaşkanı Kararında Değişiklik Yapan Kararların Yayımlandığı Resmî Gazetelerin</p><p>01/05/2026</p><p>11/07/2026</p>");
  assert.equal(d?.toISOString().slice(0, 10), "2026-07-11");
});

// ---------------------------------------------------------------------------
// Product understanding
// ---------------------------------------------------------------------------

test("composition parsing picks one word order, not a mix", () => {
  const c = parseComposition(normalizeText("pamuk %80 polyester %20"));
  assert.deepEqual(c.map((x) => [x.material, x.pct]), [["COTTON", 80], ["POLYESTER", 20]]);
  assert.deepEqual(parseComposition(normalizeText("95% cotton 5% elastane")).map((x) => x.pct), [95, 5]);
});

test("keywords: short words must be whole words", () => {
  assert.equal(phraseAt("kablosuz kulaklik", "=kablo"), false);
  assert.equal(phraseAt("usb kablo", "=kablo"), true);
  assert.equal(phraseAt("duvara monte", "mont"), false);
  assert.equal(phraseAt("kulakliklar", "kulaklik"), true);
});

test("attributes keep provenance; nothing is filled by default", () => {
  const a = attrs("Kulaklık", "Bluetooth 5.2, 30 saat pil, 500 mAh");
  assert.equal(a.wireless[0]?.value, "Bluetooth");
  assert.equal(a.wireless[0]?.provenance, "USER_ENTERED");
  assert.equal(a.battery?.value, "500 mAh");
  assert.equal(a.materials.length, 0);
  assert.equal(a.construction, null);
  assert.equal(a.condition, null);
});

test("web page: schema.org Product data read, manufacturer domain is only domain evidence", () => {
  const html = `<html><head><title>X</title><script type="application/ld+json">{"@type":"Product","name":"WH-1000XM5","brand":{"name":"Sony"},"gtin13":"4548736132610","material":"Plastic"}</script></head><body>Wireless noise cancelling headphones</body></html>`;
  const p = extractWebProduct(html);
  assert.equal(p.structured, true);
  assert.equal(p.brand, "Sony");
  assert.equal(p.gtin, "4548736132610");
  assert.equal(looksLikeManufacturerDomain("https://www.sony.com.tr/x", "Sony"), true);
  assert.equal(looksLikeManufacturerDomain("https://www.amazon.com.tr/x", "Sony"), false);
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test("candidate generation + ranking: Bluetooth headphones → 8518.30, 8517.62 as alternative", () => {
  const r = classify(INDEX, attrs("Bluetooth kulaklık", "Kablosuz kulak üstü kulaklık, Bluetooth 5.2, mikrofonlu"));
  assert.equal(r.status, "AI_PREDICTED");
  assert.equal(r.selected?.gtip, "851830009000");
  assert.ok(r.candidates.some((c) => c.gtip6 === "851762"), "8517.62 offered as an alternative");
  assert.ok(r.selected!.siblings.some((s) => s.gtip === "851830001000" && /Sivil hava/.test(s.reason)), "civil-aircraft line eliminated with a reason");
});

test("confidence: shares plus the unassigned residual add up to 100", () => {
  const r = classify(INDEX, attrs("Bluetooth kulaklık", "Kablosuz, mikrofonlu"));
  const sum = r.candidates.reduce((s, c) => s + c.confidencePct, 0) + r.residualPct;
  assert.ok(Math.abs(sum - 100) < 0.5, `sum ${sum}`);
  assert.ok(r.selected!.confidencePct > r.candidates[1]!.confidencePct);
});

test("a very short description is capped and says so", () => {
  const r = classify(INDEX, attrs("kulaklık"));
  assert.ok(r.selected!.confidencePct <= 50);
  assert.ok(r.residualPct > 0);
  assert.ok(r.capReasons.some((x) => /kısa/.test(x)));
});

test("missing technical attribute becomes evidence, not an assumption", () => {
  const r = classify(INDEX, attrs("Akıllı saat", "Nabız ölçer"));
  assert.ok(r.selected!.missing.some((e) => /Hücresel/.test(e.text)));
  assert.equal(r.selected!.gtip6, "851762", "without cellular, the usual answer (8517.62) leads");
  const lte = classify(INDEX, attrs("Akıllı saat", "e-SIM, 4G LTE"));
  assert.equal(lte.selected!.gtip, "851713000011", "with cellular, the TR line for smart watches under 8517.13");
});

test("12-digit choice follows the line's own material, not the inherited words", () => {
  const r = classify(INDEX, attrs("Kadın tişört", "%95 polyester %5 elastan, örme"));
  assert.equal(r.selected!.gtip, "610990200012");
  assert.ok(r.selected!.siblings.some((s) => s.gtip === "610990200011" && /malzeme/i.test(s.reason)));
  assert.equal(classify(INDEX, attrs("Erkek tişört", "%100 pamuk penye bisiklet yaka")).selected!.gtip, "610910000000");
});

test("conflicting evidence (knitted AND woven) is reported and caps confidence", () => {
  const r = classify(INDEX, attrs("Tişört", "%100 pamuk, örme dokuma"));
  assert.ok(r.evidence.some((e) => e.kind === "CONFLICT"));
  assert.ok(r.capReasons.some((x) => /örme hem dokuma/.test(x)));
});

test("unknown product: no invented candidate", () => {
  const r = classify(INDEX, attrs("xyz ürün"));
  assert.equal(r.status, "INSUFFICIENT");
  assert.equal(r.selected, null);
});

test("user GTİP mode: checked against the nomenclature and the model, never replaced", () => {
  const ok = classify(INDEX, attrs("Bluetooth kulaklık", "mikrofonlu"), { userGtip: "8518.30.00.90.00" });
  assert.equal(ok.status, "USER_ENTERED");
  assert.equal(ok.userCheck?.existsInNomenclature, true);
  assert.equal(ok.userCheck?.agreesWithModel, true);
  const wrong = classify(INDEX, attrs("Bluetooth kulaklık", "mikrofonlu"), { userGtip: "8517.13.00.00.19" });
  assert.equal(wrong.selected!.gtip, "851713000019", "the user's code is kept");
  assert.equal(wrong.userCheck?.agreesWithModel, false);
  const invalid = classify(INDEX, attrs("Bluetooth kulaklık"), { userGtip: "8518" });
  assert.equal(invalid.userCheck?.shapeOk, false);
  assert.equal(invalid.status, "AI_PREDICTED");
  const btb = classify(INDEX, attrs("Bluetooth kulaklık"), { userGtip: "8518.30.00.90.00", btbDeclared: true });
  assert.equal(btb.status, "BTB_DECLARED", "a declared BTB is never promoted to OFFICIAL_VERIFIED");
});

// ---------------------------------------------------------------------------
// Origin / dispatch / A.TR
// ---------------------------------------------------------------------------

test("country groups follow the official column list", () => {
  assert.equal(originColumn("DE"), "1");
  assert.equal(originColumn("GB"), "1");
  assert.equal(originColumn("QA"), "2");
  assert.equal(originColumn("AE"), "3");
  assert.equal(originColumn("BD"), "4");
  assert.equal(originColumn("PK"), "6");
  assert.equal(originColumn("CN"), "7");
});

test("dispatch Germany ≠ origin Germany: CN goods from DE without A.TR pay column 7", () => {
  const o = decideOrigin({ originCountry: "CN", dispatchCountry: "DE", atr: false, originProof: "NONE", chapter: 85 });
  assert.equal(o.dutyColumn, "7");
  assert.equal(o.additionalDutyColumn, "7");
  assert.ok(o.evidence.some((e) => /menşe ülkesi .* değildir/i.test(e.text) || /menşeye göre/.test(e.text)));
});

test("A.TR: free-circulation duty column 1, but İGV at 'Diğer Ülkeler' for non-EU origin (İGV Kararı md. 2/2)", () => {
  const cn = decideOrigin({ originCountry: "CN", dispatchCountry: "DE", atr: true, originProof: "NONE", chapter: 85 });
  assert.equal(cn.customsStatus, "FREE_CIRCULATION_EU");
  assert.equal(cn.dutyColumn, "1");
  assert.equal(cn.additionalDutyColumn, "7");
  const de = decideOrigin({ originCountry: "DE", dispatchCountry: "DE", atr: true, originProof: "NONE", chapter: 85 });
  assert.equal(de.additionalDutyColumn, "1");
  const steel = decideOrigin({ originCountry: "DE", dispatchCountry: "DE", atr: true, originProof: "NONE", chapter: 72 });
  assert.equal(steel.customsStatus, "THIRD_COUNTRY", "A.TR does not cover ECSC steel");
});

test("A.TR missing / unknown and origin missing are never silently assumed", () => {
  const unknown = decideOrigin({ originCountry: "CN", dispatchCountry: "DE", atr: null, originProof: "NONE", chapter: 85 });
  assert.equal(unknown.dutyColumn, "7");
  assert.ok(unknown.atrScenario, "the A.TR alternative is shown");
  const noOrigin = decideOrigin({ originCountry: null, dispatchCountry: "DE", atr: false, originProof: "NONE", chapter: 85 });
  assert.equal(noOrigin.status, "INSUFFICIENT");
  assert.equal(noOrigin.dutyColumn, null);
  const fta = decideOrigin({ originCountry: "KR", dispatchCountry: "KR", atr: null, originProof: "NONE", chapter: 85 });
  assert.equal(fta.dutyColumn, "7", "an FTA origin without proof of origin gets no preference");
  assert.equal(decideOrigin({ originCountry: "KR", dispatchCountry: "KR", atr: null, originProof: "EUR1", chapter: 85 }).dutyColumn, "1");
});

// ---------------------------------------------------------------------------
// Date-aware rules
// ---------------------------------------------------------------------------

const rule = (p: Partial<RuleLike> & { gtipPrefix: string }): RuleLike => ({
  id: p.gtipPrefix, originCountry: null, validFrom: new Date("2026-01-01"), validUntil: null, status: "IN_FORCE",
  sourceKey: "TR_IRK_II_LIST", sourceVersion: "2026", consolidatedAsOf: new Date("2026-07-11"), ...p,
});

test("date-sensitive lookup: out of range, consolidated-later, in force, future", () => {
  const rules = [rule({ gtipPrefix: "610910000000" })];
  assert.equal(resolveRule(rules, "610910000000", new Date("2025-03-15"), new Date("2026-09-19")).status, "OUT_OF_RANGE");
  const march = resolveRule(rules, "610910000000", new Date("2026-03-15"), new Date("2026-09-19"));
  assert.equal(march.status, "EXACT");
  assert.equal(march.status === "EXACT" && march.temporal, "CONSOLIDATED_LATER");
  const sept = resolveRule(rules, "610910000000", new Date("2026-09-01"), new Date("2026-09-19"));
  assert.equal(sept.status === "EXACT" && sept.temporal, "IN_FORCE");
  const future = resolveRule(rules, "610910000000", new Date("2026-12-01"), new Date("2026-09-19"));
  assert.equal(future.status === "EXACT" && future.temporal, "FUTURE_DATE");
});

test("split list (tariff source changed): both official lines surface as SPLIT", () => {
  const rules = [rule({ gtipPrefix: "851830009011" }), rule({ gtipPrefix: "851830009019" })];
  const r = resolveRule(rules, "851830009000", new Date("2026-09-01"), null);
  assert.equal(r.status, "SPLIT");
});

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

const colRule = (gtip: string, cols: Record<string, number>): ColumnRuleData => ({
  ...rule({ gtipPrefix: gtip }),
  columnRates: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, { pct: v, text: String(v), type: "AD_VALOREM", footnote: null }])),
  footnote: null,
  legalRef: "test",
});
const VAT: VatRuleData = { ...rule({ gtipPrefix: "" }), validFrom: new Date("2023-07-10"), consolidatedAsOf: null, ratePct: 20, legalRef: "2007/13033 md. 1/1-a" };
const FX = { EUR: { rate: 50, source: "TCMB", note: "" }, TRY: { rate: 1, source: "BASE", note: "" }, USD: { rate: 40, source: "TCMB", note: "" } };

function taxInput(p: Partial<TaxInput> = {}): TaxInput {
  return {
    gtip: "610910000000",
    gtipStatus: "AI_PREDICTED",
    importDate: new Date("2026-09-01"),
    origin: decideOrigin({ originCountry: "CN", dispatchCountry: "CN", atr: null, originProof: "NONE", chapter: 61 }),
    originCountry: "CN",
    goods: { amount: 1000, currency: "EUR" },
    freight: { amount: 100, currency: "EUR", status: "USER_ENTERED" },
    insurance: { amount: 0, currency: "EUR", status: "USER_ENTERED" },
    incoterm: "FOB",
    fx: FX,
    baseCurrency: "TRY",
    duty: { rules: [colRule("610910000000", { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 12 })], fetchedAt: new Date("2026-09-19"), loaded: true },
    igv: { rules: [colRule("610910000000", { 1: 0, 2: 0, 3: 0, 4: 39, 5: 39, 6: 39, 7: 39 })], fetchedAt: new Date("2026-09-19"), loaded: true },
    measures: { rules: [], fetchedAt: null, listDate: new Date("2026-07-13"), loaded: true },
    safeguards: { rules: [], fetchedAt: null, loaded: true },
    vat: VAT,
    legalRate474: 100,
    ...p,
  };
}

test("tax: customs value, duty, additional duty and VAT each on its own line", () => {
  const t = computeTaxes(taxInput());
  assert.equal(t.customsValue.amount, 55000);
  const gv = t.lines.find((l) => l.key === "CUSTOMS_DUTY")!;
  const igv = t.lines.find((l) => l.key === "ADDITIONAL_DUTY")!;
  assert.equal(gv.amount, 6600);
  assert.equal(igv.amount, 21450);
  assert.equal(t.vat.amount, Math.round((55000 + 6600 + 21450) * 0.2 * 100) / 100);
  assert.equal(t.vat.inLandedCost, false);
  assert.ok(t.warnings.some((w) => /TAHMİN EDİLEN GTİP/.test(w.text)));
  assert.equal(t.lines.find((l) => l.key === "EXCISE")?.status, "NOT_CHECKED");
});

test("additional duty: absent from the İGV tables → not applicable; cap from the 474 ceiling", () => {
  const none = computeTaxes(taxInput({ igv: { rules: [], fetchedAt: null, loaded: true } }));
  assert.equal(none.lines.find((l) => l.key === "ADDITIONAL_DUTY")!.status, "NOT_APPLICABLE");
  const capped = computeTaxes(taxInput({ legalRate474: 20 }));
  const igv = capped.lines.find((l) => l.key === "ADDITIONAL_DUTY")!;
  assert.equal(igv.ratePct, 38, "GV 12 + İGV capped so the total is max(50, 1.5×20) = 50");
  assert.equal(igv.provenance, "INFERRED");
});

test("tax: freight unknown gives a labelled lower bound, never a full amount", () => {
  const t = computeTaxes(taxInput({ freight: { amount: null, currency: "EUR", status: "UNKNOWN" } }));
  assert.equal(t.customsValue.amount, null);
  const gv = t.lines.find((l) => l.key === "CUSTOMS_DUTY")!;
  assert.equal(gv.amount, null);
  assert.equal(gv.lowerBound, 6000);
});

test("tax: out-of-range date and missing origin", () => {
  const old = computeTaxes(taxInput({ importDate: new Date("2025-03-15") }));
  assert.equal(old.lines.find((l) => l.key === "CUSTOMS_DUTY")!.status, "INSUFFICIENT");
  const noOrigin = computeTaxes(taxInput({ origin: decideOrigin({ originCountry: null, dispatchCountry: "CN", atr: null, originProof: null, chapter: 61 }), originCountry: null }));
  const gv = noOrigin.lines.find((l) => l.key === "CUSTOMS_DUTY")!;
  assert.equal(gv.status, "INSUFFICIENT");
  assert.equal(gv.rateText, "%0 – %12");
});

test("anti-dumping: origin-matched measure; firm range is not computed", () => {
  const m: MeasureRuleData = {
    ...rule({ gtipPrefix: "6109", originCountry: "CN" }), validFrom: new Date("2024-01-01"), consolidatedAsOf: null,
    kind: "ANTI_DUMPING", ratePct: null, rateText: "%10-%20", rateType: "RANGE", legalRef: "Tebliğ 2024/1", meta: { product: "Tişört" },
  };
  const t = computeTaxes(taxInput({ measures: { rules: [m], fetchedAt: null, listDate: null, loaded: true } }));
  const ad = t.lines.find((l) => l.key === "ANTI_DUMPING")!;
  assert.equal(ad.status, "NOT_COMPUTED");
  assert.equal(ad.amount, null);
  const vn = computeTaxes(taxInput({ originCountry: "VN", origin: decideOrigin({ originCountry: "VN", dispatchCountry: "VN", atr: null, originProof: null, chapter: 61 }), measures: { rules: [m], fetchedAt: null, listDate: null, loaded: true } }));
  assert.equal(vn.lines.find((l) => l.key === "ANTI_DUMPING")!.status, "NOT_APPLICABLE");
  const pct = computeTaxes(taxInput({ measures: { rules: [{ ...m, ratePct: 15, rateText: "%15", rateType: "AD_VALOREM" }], fetchedAt: null, listDate: null, loaded: true } }));
  assert.equal(pct.lines.find((l) => l.key === "ANTI_DUMPING")!.amount, 8250);
});

test("unavailable source: lists not loaded are shown as such, never as zero", () => {
  const t = computeTaxes(taxInput({ duty: { rules: [], fetchedAt: null, loaded: false }, measures: { rules: [], fetchedAt: null, listDate: null, loaded: false } }));
  assert.equal(t.lines.find((l) => l.key === "CUSTOMS_DUTY")!.status, "INSUFFICIENT");
  assert.equal(t.lines.find((l) => l.key === "ANTI_DUMPING")!.status, "NOT_CHECKED");
});

test("stale / consolidated source: a March date on a July consolidation needs review", () => {
  const t = computeTaxes(taxInput({ importDate: new Date("2026-03-15") }));
  const gv = t.lines.find((l) => l.key === "CUSTOMS_DUTY")!;
  assert.equal(gv.status, "NEEDS_REVIEW");
  assert.ok(gv.why.some((w) => /konsolide/.test(w)));
});

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

test("compliance: official group named → YELLOW with source; nothing is GREEN by default", () => {
  const a = attrs("Bluetooth kulaklık", "Bluetooth, şarjlı");
  const r = checkCompliance({
    attributes: a, tags: ["ELECTRICAL", "CONSUMER"], conceptKeywords: ["kulaklik"], gtip: "851830009000",
    ugd: { groups: [{ no: "2026/8", group: "Telsiz", title: "Telsiz ve Telekomünikasyon Terminal Ekipmanlarının İthalat Denetimi Tebliği", scope: "Akıllı Saatler, Bluetooth Kulaklıklar vb.", rgUrl: "https://rg", guideUrl: null }], sourceKey: "TR_UGD_GROUPS", available: true, pageDate: "2026-06-15" },
    communiques: { items: [], sourceKey: "TR_IMPORT_COMMUNIQUES", available: true },
  });
  const tareks = r.checks.find((c) => c.key === "TAREKS_2026/8")!;
  assert.equal(tareks.level, "YELLOW");
  assert.ok(tareks.evidence.some((e) => e.provenance === "OFFICIAL"));
  assert.notEqual(r.overall, "GREEN");
  const unreachable = checkCompliance({
    attributes: a, tags: [], conceptKeywords: [], gtip: null,
    ugd: { groups: [], sourceKey: "TR_UGD_GROUPS", available: false, pageDate: null },
    communiques: { items: [], sourceKey: "TR_IMPORT_COMMUNIQUES", available: false },
  });
  assert.equal(unreachable.checks.find((c) => c.key === "TAREKS")!.statusText, "KAYNAĞA ERİŞİLEMEDİ");
});

// ---------------------------------------------------------------------------
// Landed cost + logistics integration
// ---------------------------------------------------------------------------

test("landed cost: unknown broker makes it incomplete; unchecked sources are named, not zeroed", () => {
  const tax = computeTaxes(taxInput());
  const l = computeLandedCost({
    quantity: 100, unitPrice: 10, currency: "EUR", incoterm: "FOB",
    freight: { amount: 100, currency: "EUR", status: "USER_ENTERED" },
    insurance: { amount: 0, currency: "EUR", status: "USER_ENTERED" },
    broker: { amount: null, currency: "TRY", status: "UNKNOWN" },
    handling: { amount: 1000, currency: "TRY", status: "USER_ENTERED" },
    other: { amount: null, currency: "TRY", status: "UNKNOWN" },
    tax, fx: FX, baseCurrency: "TRY", salePrice: null,
  });
  assert.equal(l.totalMin, null);
  assert.deepEqual(l.missing, ["Gümrük müşaviri"]);
  assert.ok(l.unchecked.includes("Özel tüketim vergisi (ÖTV)"));
  const complete = computeLandedCost({
    quantity: 100, unitPrice: 10, currency: "EUR", incoterm: "FOB",
    freight: { amount: 100, currency: "EUR", status: "USER_ENTERED" },
    insurance: { amount: 0, currency: "EUR", status: "USER_ENTERED" },
    broker: { amount: 2000, currency: "TRY", status: "USER_ENTERED" },
    handling: { amount: 1000, currency: "TRY", status: "USER_ENTERED" },
    other: { amount: null, currency: "TRY", status: "UNKNOWN" },
    tax, fx: FX, baseCurrency: "TRY", salePrice: { amount: 1200, currency: "TRY" },
  });
  // goods 50000 + freight 5000 + GV 6600 + İGV 21450 + broker 2000 + handling 1000 = 86050 (VAT excluded)
  assert.equal(complete.totalMin, 86050);
  assert.equal(complete.perUnitMin, 860.5);
  assert.equal(complete.margin?.marginMinPct, 28.3);
  assert.equal(complete.completeness, "PARTIAL", "ÖTV not checked → never COMPLETE");
});

test("logistics integration: an estimate band flows in as ESTIMATED, a range total; CIF incoterm includes freight", () => {
  const tax = computeTaxes(taxInput());
  const l = computeLandedCost({
    quantity: 10, unitPrice: 10, currency: "EUR", incoterm: "FOB",
    freight: { amount: null, currency: "EUR", status: "ESTIMATED", min: 120, max: 220, note: "Lojistik tahmini" },
    insurance: { amount: 0, currency: "EUR", status: "USER_ENTERED" },
    broker: { amount: 0, currency: "TRY", status: "USER_ENTERED" },
    handling: { amount: 0, currency: "TRY", status: "USER_ENTERED" },
    other: { amount: null, currency: "TRY", status: "UNKNOWN" },
    tax, fx: FX, baseCurrency: "TRY", salePrice: null,
  });
  const f = l.lines.find((x) => x.key === "FREIGHT")!;
  assert.equal(f.status, "ESTIMATED");
  assert.deepEqual([f.min, f.max], [6000, 11000]);
  assert.ok(l.totalMax! > l.totalMin!);
  const cif = computeTaxes(taxInput({ incoterm: "CIF", freight: { amount: null, currency: "EUR", status: "UNKNOWN" }, insurance: { amount: null, currency: "EUR", status: "UNKNOWN" } }));
  assert.equal(cif.customsValue.amount, 50000, "CIF price already contains freight and insurance");
});
