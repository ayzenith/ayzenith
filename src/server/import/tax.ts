/**
 * IMPORT INTELLIGENCE — Turkey import tax engine (pure).
 *
 * Every charge is its own line with its own rate, base, status, provenance and
 * "why". Nothing is folded into one "tax rate". A line that cannot be computed
 * honestly — rate not a plain percentage, customs value unknown, rule not
 * loaded for the date — says so and carries no amount; when only the freight is
 * missing, a LOWER BOUND on the goods value alone is shown and labelled as such.
 */

import { DUTY_COLUMN_LABELS, countryName, isEu, type DutyColumn } from "./countries";
import type { OriginDecision } from "./origin";
import { resolveRule, type RuleLike } from "./rules";
import { formatGtip } from "./text";
import type { ClassificationStatus, CostValueStatus, EvidenceItem, Provenance } from "./types";

export type RateCellData = { pct: number | null; text: string; type: string; footnote: string | null };
export type ColumnRuleData = RuleLike & { columnRates: Record<string, RateCellData>; footnote: string | null; legalRef: string };
export type MeasureRuleData = RuleLike & {
  kind: "ANTI_DUMPING" | "COUNTERVAILING" | "SAFEGUARD";
  ratePct: number | null;
  rateText: string | null;
  rateType: string;
  legalRef: string;
  meta: { originGroup?: "EU" | null; countryNote?: string | null; countryText?: string; product?: string; measureType?: string; normalExpiry?: string | null; allOrigins?: boolean; amounts?: string[] } | null;
};
export type VatRuleData = RuleLike & { ratePct: number; legalRef: string };

export type FxTable = Record<string, { rate: number | null; source: string; note: string }>;
export type CostInput = { amount: number | null; currency: string; status: CostValueStatus; note?: string | null; min?: number | null; max?: number | null };

export type TaxInput = {
  gtip: string | null;
  gtipStatus: ClassificationStatus;
  importDate: Date;
  origin: OriginDecision;
  originCountry: string | null;
  goods: { amount: number | null; currency: string };
  freight: CostInput;
  insurance: CostInput;
  incoterm: string | null;
  fx: FxTable;
  baseCurrency: string;
  duty: { rules: ColumnRuleData[]; fetchedAt: Date | null; loaded: boolean };
  igv: { rules: ColumnRuleData[]; fetchedAt: Date | null; loaded: boolean };
  measures: { rules: MeasureRuleData[]; fetchedAt: Date | null; listDate: Date | null; loaded: boolean };
  safeguards: { rules: MeasureRuleData[]; fetchedAt: Date | null; loaded: boolean };
  vat: VatRuleData | null;
  legalRate474: number | null;
};

export type TaxLineStatus = "CALCULATED" | "NOT_APPLICABLE" | "NOT_COMPUTED" | "INSUFFICIENT" | "NEEDS_REVIEW" | "CONFLICT" | "NOT_CHECKED";

export const TAX_STATUS_LABELS: Record<TaxLineStatus, string> = {
  CALCULATED: "HESAPLANDI",
  NOT_APPLICABLE: "UYGULANMAZ",
  NOT_COMPUTED: "OTOMATİK HESAPLANMADI",
  INSUFFICIENT: "VERİ YETERSİZ",
  NEEDS_REVIEW: "RESMİ DOĞRULAMA GEREKLİ",
  CONFLICT: "ÇELİŞKİLİ KAYNAKLAR",
  NOT_CHECKED: "KONTROL EDİLMEDİ",
};

export type TaxLine = {
  key: string;
  label: string;
  status: TaxLineStatus;
  ratePct: number | null;
  rateText: string | null;
  base: number | null;
  amount: number | null;
  /** Computed on the goods value alone when the full customs value is unknown. */
  lowerBound: number | null;
  provenance: Provenance;
  why: string[];
  sourceKeys: string[];
  ruleIds: string[];
  /** In landed cost? VAT is deductible for a VAT-registered importer and is shown apart. */
  inLandedCost: boolean;
};

export type CustomsValue = {
  amount: number | null;
  lowerBound: number | null;
  status: "CALCULATED" | "PARTIAL" | "INSUFFICIENT";
  parts: Array<{ label: string; amount: number | null; status: string; note: string }>;
  why: string[];
};

export type TaxResult = {
  customsValue: CustomsValue;
  lines: TaxLine[];
  dutiesTotal: number | null;
  dutiesKnown: number;
  vat: TaxLine;
  atrScenario: { text: string; dutyPct: number | null; additionalPct: number | null } | null;
  basedOnPredictedGtip: boolean;
  warnings: EvidenceItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const FREIGHT_INCLUDED = new Set(["CFR", "CPT", "CIF", "CIP", "DAP", "DPU", "DDP"]);
const INSURANCE_INCLUDED = new Set(["CIF", "CIP", "DAP", "DPU", "DDP"]);

export function toBase(amount: number | null, currency: string, fx: FxTable, base: string): number | null {
  if (amount == null) return null;
  if (currency === base) return amount;
  const r = fx[currency]?.rate;
  return r == null ? null : amount * r;
}

export function computeCustomsValue(input: Pick<TaxInput, "goods" | "freight" | "insurance" | "incoterm" | "fx" | "baseCurrency">): CustomsValue {
  const why: string[] = [];
  const parts: CustomsValue["parts"] = [];
  const goods = toBase(input.goods.amount, input.goods.currency, input.fx, input.baseCurrency);
  parts.push({ label: "Mal bedeli", amount: goods, status: goods == null ? "UNKNOWN" : "USER_ENTERED", note: input.goods.amount == null ? "Girilmedi" : goods == null ? `${input.goods.currency} kuru yok` : "" });
  const inc = (input.incoterm ?? "").toUpperCase() || null;
  const part = (label: string, c: CostInput, included: boolean) => {
    if (included) {
      parts.push({ label, amount: 0, status: "INCLUDED", note: `${inc} teslim şeklinde mal bedeline dahil` });
      return 0;
    }
    const v = toBase(c.amount, c.currency, input.fx, input.baseCurrency);
    parts.push({ label, amount: v, status: v == null ? "UNKNOWN" : c.status, note: c.amount == null ? "Bilinmiyor" : v == null ? `${c.currency} kuru yok` : c.note ?? "" });
    return v;
  };
  if (!inc) why.push("Teslim şekli (Incoterm) girilmedi: navlun ve sigortanın fiyata dahil olmadığı kabul edilmedi, ayrıca aranıyor.");
  if (inc && ["DAP", "DPU", "DDP"].includes(inc)) why.push(`${inc}: fiyat Türkiye içi taşımayı içerebilir; gümrük kıymetinden sınır sonrası masraflar düşülmelidir — sistem bunu ayıramaz.`);
  const freight = part("Navlun (Türkiye sınırına kadar)", input.freight, inc ? FREIGHT_INCLUDED.has(inc) : false);
  const insurance = part("Sigorta", input.insurance, inc ? INSURANCE_INCLUDED.has(inc) : false);
  if (goods == null) {
    return { amount: null, lowerBound: null, status: "INSUFFICIENT", parts, why: [...why, "Mal bedeli TL'ye çevrilemedi."] };
  }
  const known = goods + (freight ?? 0) + (insurance ?? 0);
  if (freight == null || insurance == null) {
    const missing = [freight == null ? "navlun" : null, insurance == null ? "sigorta" : null].filter(Boolean).join(" ve ");
    return { amount: null, lowerBound: round2(known), status: "PARTIAL", parts, why: [...why, `Gümrük kıymeti eksik: ${missing} bilinmiyor. Vergiler yalnız alt sınır olarak gösterilir.`] };
  }
  return { amount: round2(known), lowerBound: round2(known), status: "CALCULATED", parts, why: [...why, "Gümrük kıymeti = mal bedeli + navlun + sigorta (Türkiye sınırına kadar, CIF esası)."] };
}

function line(p: Partial<TaxLine> & Pick<TaxLine, "key" | "label" | "status">): TaxLine {
  return { ratePct: null, rateText: null, base: null, amount: null, lowerBound: null, provenance: "OFFICIAL", why: [], sourceKeys: [], ruleIds: [], inLandedCost: true, ...p };
}

function applyPct(cv: CustomsValue, pct: number): { base: number | null; amount: number | null; lowerBound: number | null } {
  return {
    base: cv.amount,
    amount: cv.amount == null ? null : round2((cv.amount * pct) / 100),
    lowerBound: cv.lowerBound == null ? null : round2((cv.lowerBound * pct) / 100),
  };
}

function columnLine(
  key: string,
  label: string,
  kindLabel: string,
  rules: ColumnRuleData[],
  fetchedAt: Date | null,
  gtip: string,
  column: DutyColumn | null,
  date: Date,
  cv: CustomsValue,
  notListedMeansZero: boolean,
): TaxLine {
  const lookup = resolveRule(rules, gtip, date, fetchedAt);
  if (lookup.status === "NOT_LISTED") {
    return notListedMeansZero
      ? line({ key, label, status: "NOT_APPLICABLE", ratePct: 0, amount: 0, lowerBound: 0, why: [`${formatGtip(gtip)} ${kindLabel} tablolarında yer almıyor; karar yalnız tablolardaki GTİP'lere uygulanır.`] })
      : line({ key, label, status: "INSUFFICIENT", why: [`${formatGtip(gtip)} ${kindLabel} listesinde bulunamadı — kaynak eksik ya da GTİP güncel değil.`] });
  }
  if (lookup.status === "OUT_OF_RANGE") {
    return line({ key, label, status: "INSUFFICIENT", why: [lookup.note], ruleIds: lookup.nearest ? [lookup.nearest.id] : [], sourceKeys: lookup.nearest ? [lookup.nearest.sourceKey] : [] });
  }
  if (lookup.status === "SPLIT") {
    const cells = lookup.rules.map((r) => ({ r, cell: column ? r.columnRates[column] : null }));
    const pcts = [...new Set(cells.map((c) => c.cell?.pct ?? null))];
    const detail = cells.map((c) => `${formatGtip(c.r.gtipPrefix)}: ${c.cell?.text || "—"}`).join("; ");
    if (column && pcts.length === 1 && pcts[0] != null) {
      const pct = pcts[0];
      return line({ key, label, status: "CONFLICT", ratePct: pct, rateText: `%${pct}`, ...applyPct(cv, pct), why: [lookup.note, `Bölünen satırların hepsinde oran aynı (${detail}); hesap bu ortak oranla yapıldı.`], ruleIds: lookup.rules.map((r) => r.id), sourceKeys: [lookup.rules[0]!.sourceKey] });
    }
    if (!column) {
      const all = lookup.rules.flatMap((r) => Object.values(r.columnRates).map((c) => c.pct)).filter((p): p is number => p != null);
      return line({
        key, label, status: "INSUFFICIENT",
        rateText: all.length ? `%${Math.min(...all)} – %${Math.max(...all)}` : null,
        why: [lookup.note, `Menşe girilmedi: bu GTİP için oran ülke grubuna göre %${Math.min(...all)} ile %${Math.max(...all)} arasında.`, `Bölünen satırlar: ${detail}`],
        ruleIds: lookup.rules.map((r) => r.id), sourceKeys: [lookup.rules[0]!.sourceKey],
      });
    }
    return line({ key, label, status: "CONFLICT", why: [lookup.note, `Bölünen satırlarda oranlar farklı: ${detail}`], ruleIds: lookup.rules.map((r) => r.id), sourceKeys: [lookup.rules[0]!.sourceKey] });
  }
  const rule = lookup.rule;
  const why = [`GTİP ${formatGtip(gtip)} · ${rule.legalRef}`, `Kaynak sürümü: ${rule.sourceVersion ?? "?"}`];
  if (lookup.note) why.push(lookup.note);
  if (rule.footnote) why.push(`Listede dipnot var: "${rule.footnote}" — dipnot koşulunu kontrol edin.`);
  if (!column) {
    const pcts = Object.values(rule.columnRates).map((c) => c.pct).filter((p): p is number => p != null);
    const min = pcts.length ? Math.min(...pcts) : null;
    const max = pcts.length ? Math.max(...pcts) : null;
    return line({ key, label, status: "INSUFFICIENT", rateText: min != null ? `%${min} – %${max}` : null, why: [...why, `Menşe girilmedi: bu GTİP için oran ülke grubuna göre %${min} ile %${max} arasında.`], ruleIds: [rule.id], sourceKeys: [rule.sourceKey] });
  }
  const cell = rule.columnRates[column];
  why.push(`Uygulanan sütun: ${DUTY_COLUMN_LABELS[column]}`);
  if (!cell || cell.type === "EMPTY") {
    return line({ key, label, status: "INSUFFICIENT", why: [...why, "Bu sütunda oran okunamadı."], ruleIds: [rule.id], sourceKeys: [rule.sourceKey] });
  }
  if (cell.type !== "AD_VALOREM" || cell.pct == null) {
    return line({ key, label, status: "NOT_COMPUTED", rateText: cell.text, why: [...why, `Oran yüzde değil (${cell.text}); birim/asgari-azami tutar içeren oran otomatik hesaplanmadı.`], ruleIds: [rule.id], sourceKeys: [rule.sourceKey] });
  }
  if (cell.footnote) why.push(`Hücrede dipnot (${cell.footnote}) var.`);
  const status: TaxLineStatus = lookup.temporal === "IN_FORCE" && !rule.footnote ? "CALCULATED" : "NEEDS_REVIEW";
  return line({ key, label, status, ratePct: cell.pct, rateText: cell.text.includes("%") ? cell.text : `%${cell.text}`, ...applyPct(cv, cell.pct), why, ruleIds: [rule.id], sourceKeys: [rule.sourceKey] });
}

export function measureMatches(rules: MeasureRuleData[], gtip: string, originCountry: string | null, date: Date) {
  return rules.filter((r) => {
    if (!gtip.startsWith(r.gtipPrefix)) return false;
    if (date < r.validFrom) return false;
    if (r.validUntil && date > r.validUntil) return false;
    if (r.meta?.allOrigins) return true;
    if (!originCountry) return true;
    if (r.originCountry === originCountry) return true;
    return r.meta?.originGroup === "EU" && isEu(originCountry);
  });
}

export function computeTaxes(input: TaxInput): TaxResult {
  const warnings: EvidenceItem[] = [];
  const cv = computeCustomsValue(input);
  const gtip = input.gtip;
  const lines: TaxLine[] = [];
  const chapter = gtip ? Number(gtip.slice(0, 2)) : null;
  const industrial = chapter != null && chapter >= 25 && chapter <= 97;
  const basedOnPredictedGtip = input.gtipStatus === "AI_PREDICTED";

  if (!gtip) {
    const na = (key: string, label: string) => line({ key, label, status: "INSUFFICIENT", why: ["GTİP belirlenemedi; vergi hesaplanamaz."] });
    const vat = na("VAT", "İthalat KDV'si");
    return { customsValue: cv, lines: [na("CUSTOMS_DUTY", "Gümrük vergisi"), na("ADDITIONAL_DUTY", "İlave gümrük vergisi (İGV)")], dutiesTotal: null, dutiesKnown: 0, vat: { ...vat, inLandedCost: false }, atrScenario: null, basedOnPredictedGtip, warnings };
  }

  // 1. Customs duty.
  const duty = !industrial
    ? line({ key: "CUSTOMS_DUTY", label: "Gümrük vergisi", status: "INSUFFICIENT", why: [`${chapter}. fasıl için oran listesi (I sayılı / II sayılı liste 4–24. fasıllar, III, IV) V1'de yüklenmedi.`] })
    : !input.duty.loaded
      ? line({ key: "CUSTOMS_DUTY", label: "Gümrük vergisi", status: "INSUFFICIENT", why: ["İthalat Rejimi Kararı listesi sisteme yüklenmemiş (KAYNAĞA ERİŞİLEMEDİ veya henüz içe aktarılmadı)."] })
      : columnLine("CUSTOMS_DUTY", "Gümrük vergisi", "İthalat Rejimi Kararı II sayılı", input.duty.rules, input.duty.fetchedAt, gtip, input.origin.dutyColumn, input.importDate, cv, false);
  duty.why.unshift(...input.origin.dutyWhy);
  if (industrial) {
    duty.why.push("İthalat Rejimi Kararı V (gümrük vergisi askıya alınan sanayi ürünleri), VI ve VII (nihai kullanım) sayılı listeleri sisteme yüklenmedi; ürün bu listelerde yer alıyorsa oran daha düşük olabilir.");
  }
  lines.push(duty);

  // 2. Additional customs duty (İGV).
  let igv: TaxLine;
  if (!industrial) {
    igv = line({ key: "ADDITIONAL_DUTY", label: "İlave gümrük vergisi (İGV)", status: "INSUFFICIENT", why: [`${chapter}. fasıl için İGV Ek-2/Ek-3 tabloları V1'de yüklenmedi.`] });
  } else if (!input.igv.loaded) {
    igv = line({ key: "ADDITIONAL_DUTY", label: "İlave gümrük vergisi (İGV)", status: "INSUFFICIENT", why: ["İGV tabloları sisteme yüklenmemiş."] });
  } else if (input.origin.additionalDutyWaived) {
    igv = line({ key: "ADDITIONAL_DUTY", label: "İlave gümrük vergisi (İGV)", status: "NEEDS_REVIEW", ratePct: 0, amount: 0, lowerBound: 0, why: [...input.origin.additionalDutyWhy] });
  } else {
    igv = columnLine("ADDITIONAL_DUTY", "İlave gümrük vergisi (İGV)", "İGV Kararı Ek-1", input.igv.rules, input.igv.fetchedAt, gtip, input.origin.additionalDutyColumn, input.importDate, cv, true);
    igv.why.unshift(...input.origin.additionalDutyWhy);
  }
  // İGV Kararı md. 2/3: GV + İGV may not exceed the 474 ceiling raised to 50 or by 50 %.
  if (duty.ratePct != null && igv.ratePct != null && igv.ratePct > 0 && input.legalRate474 != null) {
    const cap = Math.max(50, input.legalRate474 * 1.5);
    if (duty.ratePct + igv.ratePct > cap) {
      const capped = Math.max(0, cap - duty.ratePct);
      igv.why.push(`GV %${duty.ratePct} + İGV %${igv.ratePct} = %${duty.ratePct + igv.ratePct}, 474 sayılı Kanun haddi (%${input.legalRate474}) üzerinden hesaplanan sınırı (%${cap}) aşıyor; İGV %${capped} ile sınırlandı (İGV Kararı md. 2/3 — sistemin yorumu, doğrulayın).`);
      Object.assign(igv, applyPct(cv, capped), { ratePct: capped, status: "NEEDS_REVIEW" as const, provenance: "INFERRED" as const });
    }
  }
  lines.push(igv);

  // 3. Anti-dumping / countervailing.
  if (!input.measures.loaded) {
    lines.push(line({ key: "ANTI_DUMPING", label: "Damping / sübvansiyon önlemi", status: "NOT_CHECKED", why: ["Yürürlükteki önlemler listesi sisteme yüklenmemiş."] }));
  } else {
    const matches = measureMatches(input.measures.rules, gtip, input.originCountry, input.importDate);
    const listDate = input.measures.listDate ? input.measures.listDate.toISOString().slice(0, 10) : "?";
    if (matches.length === 0) {
      lines.push(line({ key: "ANTI_DUMPING", label: "Damping / sübvansiyon önlemi", status: "NOT_APPLICABLE", ratePct: 0, amount: 0, lowerBound: 0, why: [`Ticaret Bakanlığı "Yürürlükteki Önlemler" listesinde (${listDate}) ${formatGtip(gtip)} + ${input.originCountry ? countryName(input.originCountry) : "menşe"} için önlem yok.`, "Önlemlerin etkisiz kılınmasına (izleme) ilişkin genişletmeler bu listede olmayabilir; ayrıca kontrol edilmedi."], sourceKeys: ["TR_TRADE_DEFENCE_AD"] }));
    }
    for (const m of matches) {
      const key = m.kind === "COUNTERVAILING" ? "COUNTERVAILING" : "ANTI_DUMPING";
      const label = `${m.kind === "COUNTERVAILING" ? "Telafi edici vergi" : "Dampinge karşı vergi"} — ${m.meta?.product ?? ""}`.trim();
      const why = [`${m.legalRef}`, `Önlem: ${formatGtip(m.gtipPrefix)} · ${m.meta?.countryText ?? m.originCountry ?? ""} · ${m.meta?.measureType ?? ""}`];
      if (!input.originCountry) why.push("Menşe girilmediği için menşeye bakılmadan listelendi.");
      if (m.meta?.countryNote) why.push(`Kapsam notu: ${m.meta.countryNote}`);
      if (m.meta?.normalExpiry && new Date(m.meta.normalExpiry) < input.importDate) why.push(`Önlemin normal süresi ${m.meta.normalExpiry.slice(0, 10)} tarihinde doldu; liste hâlâ yürürlükte gösteriyor (gözden geçirme sürüyor olabilir).`);
      if (m.ratePct != null && m.rateType === "AD_VALOREM" && input.originCountry) {
        lines.push(line({ key, label, status: "NEEDS_REVIEW", ratePct: m.ratePct, rateText: m.rateText, ...applyPct(cv, m.ratePct), why: [...why, "Oran CIF üzerinden; firma bazlı istisnalar için tebliği kontrol edin."], ruleIds: [m.id], sourceKeys: [m.sourceKey] }));
      } else {
        lines.push(line({ key, label, status: input.originCountry ? "NOT_COMPUTED" : "INSUFFICIENT", rateText: m.rateText, why: [...why, m.rateType === "RANGE" ? "Oran firma bazlı bir aralık — üretici firmaya göre değişir, tek oran seçilmedi." : m.rateType === "SPECIFIC" ? "Birim başına tutar (ör. $/ton, $/adet) — otomatik hesaplanmadı." : "Oran metin olarak verilmiş."], ruleIds: [m.id], sourceKeys: [m.sourceKey] }));
      }
    }
  }

  // 4. Safeguard.
  if (!input.safeguards.loaded) {
    lines.push(line({ key: "SAFEGUARD", label: "Korunma önlemi", status: "NOT_CHECKED", why: ["Korunma önlemleri listesi sisteme yüklenmemiş."] }));
  } else {
    const sg = measureMatches(input.safeguards.rules, gtip, input.originCountry, input.importDate);
    if (sg.length === 0) {
      lines.push(line({ key: "SAFEGUARD", label: "Korunma önlemi", status: "NOT_APPLICABLE", ratePct: 0, amount: 0, lowerBound: 0, why: [`Ticaret Bakanlığı "Yürürlükteki Korunma Önlemleri" listesinde ${formatGtip(gtip)} için önlem yok.`], sourceKeys: ["TR_TRADE_DEFENCE_SG"] }));
    }
    for (const m of sg) {
      lines.push(line({ key: "SAFEGUARD", label: `Korunma önlemi — ${m.meta?.product ?? ""}`.trim(), status: "NOT_COMPUTED", rateText: (m.meta?.amounts ?? []).join(" | ") || m.rateText, why: [m.legalRef, `Kapsam: ${formatGtip(m.gtipPrefix)} · ${m.meta?.countryText ?? ""}`, "Dönemsel tutarlar metin olarak verilmiş; otomatik hesaplanmadı. Muafiyet (gelişmekte olan ülkeler vb.) için kararı kontrol edin."], ruleIds: [m.id], sourceKeys: [m.sourceKey] }));
    }
  }

  // 5. Not connected in V1 — shown, never skipped.
  lines.push(line({ key: "SURVEILLANCE", label: "Gözetim uygulaması", status: "NOT_CHECKED", provenance: "UNKNOWN", why: ["İthalatta gözetim tebliğleri sisteme yüklenmedi."], inLandedCost: false }));
  lines.push(line({ key: "QUOTA", label: "Tarife kontenjanı / kota", status: "NOT_CHECKED", provenance: "UNKNOWN", why: ["Kontenjan listeleri sisteme yüklenmedi."], inLandedCost: false }));
  lines.push(line({ key: "EXCISE", label: "Özel tüketim vergisi (ÖTV)", status: "NOT_CHECKED", provenance: "UNKNOWN", why: ["ÖTV (I)-(IV) sayılı listeler sisteme yüklenmedi; bu ürün ÖTV'ye tabiyse maliyet eksik kalır."] }));

  // 6. VAT.
  const dutyLines = lines.filter((l) => l.inLandedCost);
  const known = dutyLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const knownLower = dutyLines.reduce((s, l) => s + (l.amount ?? l.lowerBound ?? 0), 0);
  const unresolved = dutyLines.filter((l) => l.amount == null && l.status !== "NOT_APPLICABLE" && l.status !== "NOT_CHECKED");
  let vat: TaxLine;
  if (!input.vat || input.importDate < input.vat.validFrom) {
    vat = line({ key: "VAT", label: "İthalat KDV'si", status: "INSUFFICIENT", inLandedCost: false, why: [input.vat ? "Bu tarih için yüklü KDV oranı sürümü yok." : "KDV oran kaynağı yüklenmemiş."] });
  } else {
    const pct = input.vat.ratePct;
    const base = cv.amount != null && unresolved.length === 0 ? round2(cv.amount + known) : null;
    const lowerBase = cv.lowerBound != null ? round2(cv.lowerBound + knownLower) : null;
    vat = line({
      key: "VAT",
      label: "İthalat KDV'si",
      status: "NEEDS_REVIEW",
      ratePct: pct,
      rateText: `%${pct}`,
      base,
      amount: base == null ? null : round2((base * pct) / 100),
      lowerBound: lowerBase == null ? null : round2((lowerBase * pct) / 100),
      inLandedCost: false,
      why: [
        `${input.vat.legalRef} — genel oran %${pct}.`,
        "İndirimli oran listeleri (%1 / %10) GTİP bazında sistemce kontrol edilmedi.",
        "Matrah = gümrük kıymeti + ithalatta ödenen vergiler (KDV Kanunu md. 21 — metin sistemde doğrulanmadı); tescile kadar yapılan diğer giderler girilmediyse eklenmedi.",
        ...(unresolved.length ? [`Hesaplanamayan kalemler var (${unresolved.map((u) => u.label).join(", ")}); KDV yalnız alt sınır olarak gösterildi.`] : []),
        "KDV mükellefi ithalatçı için indirilebilir: maliyete değil nakit akışına etki eder.",
      ],
      ruleIds: [input.vat.id],
      sourceKeys: [input.vat.sourceKey],
    });
  }

  // A.TR unknown: show what A.TR would change, using the same rules.
  let atrScenario: TaxResult["atrScenario"] = null;
  if (input.origin.atrScenario && industrial && input.duty.loaded) {
    const d = resolveRule(input.duty.rules, gtip, input.importDate, input.duty.fetchedAt);
    const g = resolveRule(input.igv.rules, gtip, input.importDate, input.igv.fetchedAt);
    // A split list (the same place stated as .11 / .19) can still answer, as
    // long as every split line agrees on the rate.
    const pctFrom = (lookup: typeof d, column: DutyColumn): number | null => {
      if (lookup.status === "EXACT" || lookup.status === "PREFIX") return lookup.rule.columnRates[column]?.pct ?? null;
      if (lookup.status === "SPLIT") {
        const pcts = [...new Set(lookup.rules.map((r) => r.columnRates[column]?.pct ?? null))];
        return pcts.length === 1 ? pcts[0] ?? null : null;
      }
      return null;
    };
    const dutyPct = pctFrom(d, input.origin.atrScenario.dutyColumn);
    const additionalPct = g.status === "NOT_LISTED" ? 0 : pctFrom(g, input.origin.atrScenario.additionalDutyColumn);
    atrScenario = { text: "A.TR sunulursa (AB'de serbest dolaşım):", dutyPct, additionalPct };
  }

  if (basedOnPredictedGtip) {
    warnings.push({ area: "TAX", kind: "NOTE", polarity: "NEGATIVE", provenance: "AI_PREDICTED", text: "Vergiler AI tarafından TAHMİN EDİLEN GTİP ile hesaplandı; GTİP değişirse tüm kalemler değişir." });
  }
  const dutiesTotal = unresolved.length === 0 && cv.amount != null ? round2(known) : null;
  return { customsValue: cv, lines, dutiesTotal, dutiesKnown: round2(known), vat, atrScenario, basedOnPredictedGtip, warnings };
}
