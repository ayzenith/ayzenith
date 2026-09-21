import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getOsSettings } from "@/server/os/settings";
import { suggestRates } from "@/server/os/fx";
import { docDay } from "@/server/os/fx-tcmb";
import { resolveLogisticsQuery, type LogisticsQueryResult } from "@/server/logistics/query";
import { nextCode } from "@/server/os/sequence";
import { extractAttributes, type ProductAttributes, type TextSource } from "./attributes";
import { classify, type ClassificationResult } from "./classify";
import { checkCompliance, type ComplianceCheck } from "./compliance";
import { CONCEPTS, matchConcepts, type ComplianceTag } from "./concepts";
import { countryName } from "./countries";
import { computeLandedCost, type LandedCost } from "./landed";
import { decideOrigin, type OriginDecision, type OriginProof } from "./origin";
import { loadComplianceSources, loadNomenclatureIndex, loadRulesFor, nomenclatureMeta } from "./repo";
import { fetchProductPage, SOURCE_CATALOGUE } from "./sources";
import { computeTaxes, type CostInput, type FxTable, type TaxResult } from "./tax";
import { formatGtip, gtipDigits } from "./text";
import type { ComplianceLevel, EvidenceItem, SourceRef } from "./types";

/**
 * IMPORT INTELLIGENCE — the orchestrator.
 *
 * PRODUCT → CLASSIFICATION → ORIGIN → COMPLIANCE → TAX → LOGISTICS → LANDED
 * COST → MARGIN, in that order, each step handed only what the previous one
 * actually established. Freight comes from the EXISTING Logistics Intelligence
 * query layer (`resolveLogisticsQuery`) — this module never estimates freight
 * itself and never turns a market reference into a cost. Exchange rates come
 * from the EXISTING TCMB layer. Nothing here writes to either.
 *
 * Every result carries its own status; there is deliberately no single overall
 * confidence number.
 */

export type MoneyInput = { amount: number | null; currency: string };

export type ImportAnalysisInput = {
  productName: string;
  description: string | null;
  specText: string | null;
  urls: string[];
  brand: string | null;
  model: string | null;
  mpn: string | null;
  ean: string | null;
  condition: "NEW" | "USED" | "REFURBISHED" | null;
  itemId: string | null;
  supplierId: string | null;
  gtipMode: "PREDICT" | "USER";
  userGtip: string | null;
  btbRef: string | null;
  originCountry: string | null;
  dispatchCountry: string | null;
  dispatchCity: string | null;
  atr: boolean | null;
  originProof: OriginProof | null;
  importDate: Date;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  currency: string;
  incoterm: string | null;
  freight: MoneyInput;
  insurance: MoneyInput;
  broker: MoneyInput;
  handling: MoneyInput;
  other: MoneyInput;
  weightKg: number | null;
  volumeM3: number | null;
  pallets: number | null;
  shipmentType: "LTL" | "FTL";
  destCity: string;
  salePrice: MoneyInput;
};

export type AreaStatus = { area: string; label: string; status: string; tone: "ok" | "warn" | "bad" | "info"; detail: string };

export type ImportAnalysisResult = {
  input: ImportAnalysisInput;
  attributes: ProductAttributes;
  web: Array<{ url: string; status: string; tier: number; title: string | null; structured: boolean; error: string | null; fromCache: boolean }>;
  classification: ClassificationResult;
  origin: OriginDecision;
  compliance: { checks: ComplianceCheck[]; overall: ComplianceLevel };
  tax: TaxResult;
  logistics: { query: LogisticsQueryResult | null; note: string; freightSource: string } | null;
  landed: LandedCost;
  fx: { table: FxTable; baseCurrency: string; day: string | null };
  statuses: AreaStatus[];
  sources: SourceRef[];
  evidence: EvidenceItem[];
  nomenclature: { available: boolean; trLineCount: number; version: string | null };
};

function money(m: MoneyInput, status: CostInput["status"], note?: string | null): CostInput {
  return { amount: m.amount, currency: m.currency, status: m.amount == null ? "UNKNOWN" : status, note: note ?? null };
}

export async function runImportAnalysis(
  input: ImportAnalysisInput,
  opts: { persist?: boolean; userId?: string | null } = {},
): Promise<{ caseId: string | null; result: ImportAnalysisResult }> {
  const evidence: EvidenceItem[] = [];

  // 1. Product understanding — the user's words, plus any page they pointed at.
  const texts: TextSource[] = [];
  if (input.description) texts.push({ text: input.description, provenance: "USER_ENTERED", from: "Ürün açıklaması" });
  if (input.specText) texts.push({ text: input.specText, provenance: "USER_ENTERED", from: "Teknik özellikler / datasheet metni" });
  if (input.condition) texts.push({ text: input.condition === "NEW" ? "yeni ürün" : input.condition === "USED" ? "kullanılmış ikinci el" : "yenilenmiş refurbished", provenance: "USER_ENTERED", from: "Ürün durumu" });

  const web: ImportAnalysisResult["web"] = [];
  for (const url of input.urls.filter((u) => u.trim()).slice(0, 3)) {
    const res = await fetchProductPage(url.trim(), input.brand);
    web.push({ url, status: res.status, tier: res.tier, title: res.product?.title ?? null, structured: res.product?.structured ?? false, error: res.error, fromCache: res.fromCache });
    if (res.status === "OK" && res.product) {
      texts.push({ text: res.product.text, provenance: "WEB_EXTRACTED", from: url, sourceKey: res.key, tier: res.tier });
      evidence.push({
        area: "PRODUCT",
        kind: res.tier === 3 ? "MANUFACTURER" : "TECHNICAL",
        polarity: "POSITIVE",
        provenance: "WEB_EXTRACTED",
        text: `${res.tier === 3 ? "Üretici alan adına benzeyen" : "Üçüncü taraf"} sayfa okundu (${url})${res.product.structured ? ", sayfa schema.org Product verisi yayımlıyor" : ""}${res.fromCache ? " — önbellekten" : ""}.`,
        sourceKey: res.key,
      });
    } else {
      evidence.push({ area: "PRODUCT", kind: "SOURCE_UNAVAILABLE", polarity: "NEGATIVE", provenance: "UNKNOWN", text: `KAYNAĞA ERİŞİLEMEDİ: ${url} — ${res.error ?? "bilinmeyen hata"}`, sourceKey: res.key });
    }
  }

  const attributes = extractAttributes({ name: input.productName, brand: input.brand, model: input.model, mpn: input.mpn, ean: input.ean }, texts);
  if (attributes.ean && !attributes.ean.valid) {
    evidence.push({ area: "PRODUCT", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "CALCULATED", text: `Girilen EAN/GTIN (${attributes.ean.value}) kontrol hanesi doğrulanmadı — barkod yanlış olabilir.` });
  }
  if (attributes.ean?.valid) {
    evidence.push({ area: "PRODUCT", kind: "TECHNICAL", polarity: "POSITIVE", provenance: "CALCULATED", text: `EAN/GTIN kontrol hanesi doğru (${attributes.ean.value}).` });
  }

  // 2. Classification against the official nomenclature.
  const [index, meta] = await Promise.all([loadNomenclatureIndex(), nomenclatureMeta()]);
  let classification: ClassificationResult;
  if (!index) {
    classification = {
      mode: input.gtipMode === "USER" ? "USER" : "PREDICT",
      status: "INSUFFICIENT",
      selected: null,
      candidates: [],
      residualPct: 100,
      capReasons: ["Türk Gümrük Tarife Cetveli sisteme yüklenmemiş."],
      userCheck: null,
      evidence: [{ area: "CLASSIFICATION", kind: "SOURCE_UNAVAILABLE", polarity: "NEGATIVE", provenance: "UNKNOWN", text: "GTİP tahmini yapılamadı: tarife cetveli kaynağı yüklü değil." }],
    };
  } else {
    classification = classify(index, attributes, {
      userGtip: input.gtipMode === "USER" ? input.userGtip : null,
      btbDeclared: !!input.btbRef?.trim(),
    });
  }
  evidence.push(...classification.evidence);
  if (input.btbRef?.trim()) {
    evidence.push({
      area: "CLASSIFICATION", kind: "BTB", polarity: "NEUTRAL", provenance: "USER_ENTERED",
      text: `BTB (Bağlayıcı Tarife Bilgisi) beyanı: ${input.btbRef.trim()} — sistem bu belgeyi resmi kayıtla EŞLEŞTİRMEDİ; doğrulanmamış kullanıcı beyanıdır.`,
    });
  }

  const gtip = classification.selected?.gtip ? gtipDigits(classification.selected.gtip) : null;
  const chapter = gtip ? Number(gtip.slice(0, 2)) : null;

  // 3. Origin / dispatch / A.TR.
  const origin = decideOrigin({
    originCountry: input.originCountry,
    dispatchCountry: input.dispatchCountry,
    atr: input.atr,
    originProof: input.originProof,
    chapter,
  });
  evidence.push(...origin.evidence);

  // 4. Rules, FX, taxes.
  const settings = await getOsSettings();
  const day = docDay(input.importDate);
  const currencies = [...new Set([input.currency, input.freight.currency, input.insurance.currency, input.broker.currency, input.handling.currency, input.other.currency, input.salePrice.currency, "EUR", settings.baseCurrency].filter(Boolean))];
  const rates = await suggestRates(day, currencies, settings);
  const fx: FxTable = {};
  for (const c of currencies) {
    const r = rates[c];
    fx[c] = { rate: r?.rate != null ? Number(r.rate) : c === settings.baseCurrency ? 1 : null, source: r?.source ?? "NONE", note: r?.note ?? "" };
    if (fx[c]!.rate == null) {
      evidence.push({ area: "TAX", kind: "MISSING_INFO", polarity: "NEGATIVE", provenance: "UNKNOWN", text: `${c} için ${day} tarihli kur bulunamadı (${r?.note ?? ""}). Bu para birimindeki tutarlar TL'ye çevrilemedi.` });
    }
  }

  const rules = gtip ? await loadRulesFor(gtip) : null;
  const line474 = gtip && index ? index.tr.get(gtip)?.legalRate474 ?? null : null;
  const tax: TaxResult = computeTaxes({
    gtip,
    gtipStatus: classification.status,
    importDate: input.importDate,
    origin,
    originCountry: input.originCountry,
    goods: { amount: input.quantity != null && input.unitPrice != null ? input.quantity * input.unitPrice : null, currency: input.currency },
    freight: money(input.freight, "USER_ENTERED"),
    insurance: money(input.insurance, "USER_ENTERED"),
    incoterm: input.incoterm,
    fx,
    baseCurrency: settings.baseCurrency,
    duty: rules?.duty ?? { rules: [], fetchedAt: null, loaded: false },
    igv: rules?.igv ?? { rules: [], fetchedAt: null, loaded: false },
    measures: rules?.measures ?? { rules: [], fetchedAt: null, listDate: null, loaded: false },
    safeguards: rules?.safeguards ?? { rules: [], fetchedAt: null, loaded: false },
    vat: rules?.vat ?? null,
    legalRate474: line474 ?? null,
  });
  evidence.push(...tax.warnings);

  // 5. Import controls.
  const conceptMatches = matchConcepts(attributes);
  const topConceptId = classification.selected?.conceptId ?? conceptMatches[0]?.concept.id ?? null;
  const topConcept = CONCEPTS.find((c) => c.id === topConceptId) ?? null;
  const complianceSources = await loadComplianceSources();
  const compliance = checkCompliance({
    attributes,
    tags: (topConcept?.compliance ?? []) as ComplianceTag[],
    conceptKeywords: topConcept?.keywords ?? [],
    gtip,
    ugd: complianceSources.ugd,
    communiques: complianceSources.communiques,
  });
  for (const c of compliance.checks) evidence.push(...c.evidence.map((e) => ({ ...e, detail: { ...(e.detail ?? {}), check: c.key } })));

  // 6. Logistics — the existing query layer, called for the IMPORT direction.
  let logistics: ImportAnalysisResult["logistics"] = null;
  let freightCost: CostInput = money(input.freight, "USER_ENTERED", input.freight.amount == null ? "Girilmedi" : null);
  if (input.dispatchCity && input.dispatchCountry) {
    try {
      const query = await resolveLogisticsQuery({
        originCity: input.dispatchCity,
        originCountry: input.dispatchCountry,
        destCity: input.destCity || "Istanbul",
        destCountry: "TR",
        shipmentType: input.shipmentType,
        weightKg: input.weightKg,
        volumeM3: input.volumeM3,
        palletCount: input.pallets != null ? Math.round(input.pallets) : null,
        hsCode: gtip,
        goodsValue: input.quantity != null && input.unitPrice != null ? input.quantity * input.unitPrice : null,
        goodsCurrency: input.currency,
        date: input.importDate,
      });
      const useEstimate = input.freight.amount == null && query.estimate.status === "OK";
      if (useEstimate && query.estimate.status === "OK") {
        freightCost = { amount: null, currency: "EUR", status: "ESTIMATED", min: query.estimate.minEur, max: query.estimate.maxEur, note: `Lojistik tahmini (${query.estimate.evidenceLevel}, güven ${query.estimate.estimateability})` };
      }
      logistics = {
        query,
        note:
          query.estimate.status === "OK"
            ? "Navlun tahmini gerçek taşıma gözlemlerinden üretildi."
            : `Navlun tahmini yok: ${query.estimate.reason} Piyasa referansı varsa ayrı gösterilir ve maliyete EKLENMEZ.`,
        freightSource: input.freight.amount != null ? "USER_ENTERED" : useEstimate ? "ESTIMATED" : "UNKNOWN",
      };
      if (query.marketReferences.length > 0) {
        evidence.push({
          area: "LOGISTICS", kind: "NOTE", polarity: "NEUTRAL", provenance: "OFFICIAL",
          text: `${query.marketReferences.length} piyasa referansı eşleşti (yayınlanmış fiyat bandı). Mimari kural: piyasa referansı navlun tahminine ve landed cost'a EKLENMEZ, ayrı gösterilir.`,
        });
      }
    } catch (e) {
      logistics = { query: null, note: `Lojistik sorgusu çalıştırılamadı: ${(e as Error).message}`, freightSource: input.freight.amount != null ? "USER_ENTERED" : "UNKNOWN" };
    }
  }

  // 7. Landed cost and margin.
  const landed = computeLandedCost({
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: input.currency,
    incoterm: input.incoterm,
    freight: freightCost,
    insurance: money(input.insurance, "USER_ENTERED", input.insurance.amount == null ? "Girilmedi" : null),
    broker: money(input.broker, "USER_ENTERED", input.broker.amount == null ? "Girilmedi" : null),
    handling: money(input.handling, "USER_ENTERED", input.handling.amount == null ? "Girilmedi" : null),
    other: money(input.other, "USER_ENTERED", input.other.amount == null ? "Girilmedi" : null),
    tax,
    fx,
    baseCurrency: settings.baseCurrency,
    salePrice: input.salePrice.amount != null ? input.salePrice : null,
  });

  // 8. Per-area status — never one overall score.
  const statuses: AreaStatus[] = [
    {
      area: "GTIP",
      label: "GTİP",
      status:
        classification.status === "AI_PREDICTED" ? `AI TARAFINDAN TAHMİN EDİLDİ — %${classification.selected?.confidencePct ?? 0}`
        : classification.status === "USER_ENTERED" ? "KULLANICI GİRDİSİ"
        : classification.status === "BTB_DECLARED" ? "BTB BEYANI (DOĞRULANMADI)"
        : classification.status === "OFFICIAL_VERIFIED" ? "RESMİ DOĞRULANDI"
        : "VERİ YETERSİZ",
      tone: classification.status === "INSUFFICIENT" ? "bad" : classification.status === "AI_PREDICTED" ? "warn" : "info",
      detail: classification.selected ? `${formatGtip(classification.selected.gtip)} — ${classification.selected.description}` : "Aday bulunamadı.",
    },
    {
      area: "CUSTOMS_DUTY",
      label: "Gümrük vergisi",
      status: statusOf(tax, "CUSTOMS_DUTY"),
      tone: toneOf(statusOf(tax, "CUSTOMS_DUTY")),
      detail: tax.lines.find((l) => l.key === "CUSTOMS_DUTY")?.rateText ?? "—",
    },
    {
      area: "ADDITIONAL_DUTY",
      label: "İlave gümrük vergisi",
      status: statusOf(tax, "ADDITIONAL_DUTY"),
      tone: toneOf(statusOf(tax, "ADDITIONAL_DUTY")),
      detail: tax.lines.find((l) => l.key === "ADDITIONAL_DUTY")?.rateText ?? "—",
    },
    { area: "COMPLIANCE", label: "Uyum / denetim", status: compliance.overall === "RED" ? "KISITLAMA OLABİLİR" : compliance.overall === "YELLOW" ? "KISMEN DOĞRULANDI" : compliance.overall === "GREEN" ? "UYGUN (BEYANA GÖRE)" : "VERİ YETERSİZ", tone: compliance.overall === "RED" ? "bad" : compliance.overall === "YELLOW" ? "warn" : "info", detail: `${compliance.checks.filter((c) => c.level === "YELLOW" || c.level === "RED").length} kontrol işaretlendi` },
    { area: "FREIGHT", label: "Navlun", status: freightCost.status === "USER_ENTERED" ? "KULLANICI GİRDİSİ" : freightCost.status === "ESTIMATED" ? "TAHMİN (gerçek gözlemlerden)" : "VERİ YETERSİZ", tone: freightCost.status === "UNKNOWN" ? "bad" : "ok", detail: logistics?.note ?? "Çıkış şehri girilmedi." },
    { area: "FX", label: "Kur", status: fx[input.currency]?.source === "TCMB" ? "RESMİ KAYNAK (TCMB)" : fx[input.currency]?.source === "MANUAL" ? "ELLE GİRİLEN KUR" : fx[input.currency]?.rate != null ? "ANA PARA BİRİMİ" : "VERİ YETERSİZ", tone: fx[input.currency]?.rate == null ? "bad" : "ok", detail: fx[input.currency]?.note ?? "" },
    {
      area: "LANDED",
      label: "Landed cost",
      status:
        landed.completeness === "COMPLETE"
          ? "HESAPLANDI"
          : landed.missing.length > 0
            ? `EKSİK — ${landed.missing.join(", ")}`
            : `KISMİ — ${landed.unchecked.join(", ")} hariç`,
      tone: landed.completeness === "COMPLETE" ? "ok" : landed.missing.length > 0 ? "bad" : "warn",
      detail:
        landed.totalMin != null
          ? `${landed.totalMin.toLocaleString("tr-TR")}${landed.totalMax !== landed.totalMin ? ` – ${landed.totalMax?.toLocaleString("tr-TR")}` : ""} ${landed.baseCurrency}${landed.unchecked.length ? ` (${landed.unchecked.join(", ")} hariç)` : ""}`
          : `Bilinen kalemler: ${landed.knownTotal.toLocaleString("tr-TR")} ${landed.baseCurrency}`,
    },
  ];

  const sources: SourceRef[] = rules?.sources ?? [];
  const result: ImportAnalysisResult = {
    input,
    attributes,
    web,
    classification,
    origin,
    compliance,
    tax,
    logistics,
    landed,
    fx: { table: fx, baseCurrency: settings.baseCurrency, day },
    statuses,
    sources,
    evidence,
    nomenclature: { available: !!index, trLineCount: meta.trLineCount, version: meta.trSource?.version ?? null },
  };

  if (!opts.persist) return { caseId: null, result };
  const caseId = await persistCase(input, result, opts.userId ?? null);
  return { caseId, result };
}

function statusOf(tax: TaxResult, key: string): string {
  const l = tax.lines.find((x) => x.key === key);
  if (!l) return "VERİ YETERSİZ";
  return l.status === "CALCULATED" ? "KAYNAK DOĞRULANDI" : l.status === "NOT_APPLICABLE" ? "UYGULANMAZ" : l.status === "NEEDS_REVIEW" ? "RESMİ DOĞRULAMA GEREKLİ" : l.status === "CONFLICT" ? "ÇELİŞKİLİ KAYNAKLAR" : l.status === "NOT_COMPUTED" ? "OTOMATİK HESAPLANMADI" : l.status === "NOT_CHECKED" ? "KONTROL EDİLMEDİ" : "VERİ YETERSİZ";
}

function toneOf(status: string): AreaStatus["tone"] {
  if (status === "KAYNAK DOĞRULANDI" || status === "UYGULANMAZ") return "ok";
  if (status === "VERİ YETERSİZ" || status === "ÇELİŞKİLİ KAYNAKLAR") return "bad";
  return "warn";
}

async function persistCase(input: ImportAnalysisInput, result: ImportAnalysisResult, userId: string | null): Promise<string> {
  const sourceIds = new Map<string, string>();
  for (const s of await db.importSource.findMany({ where: { isCurrent: true }, select: { id: true, key: true } })) sourceIds.set(s.key, s.id);

  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "ITH", input.importDate.getFullYear());
    const created = await tx.importCase.create({
      data: {
        code,
        productName: input.productName,
        itemId: input.itemId,
        supplierId: input.supplierId,
        importDate: input.importDate,
        originCountry: input.originCountry,
        dispatchCountry: input.dispatchCountry,
        atrAvailable: input.atr,
        originProof: input.originProof,
        customsStatus: result.origin.customsStatus,
        gtipMode: input.gtipMode,
        userGtip: input.userGtip ? gtipDigits(input.userGtip) : null,
        predictedGtip: result.classification.candidates[0]?.gtip ?? null,
        classificationStatus: result.classification.status,
        input: input as unknown as Prisma.InputJsonValue,
        productProfile: result.attributes as unknown as Prisma.InputJsonValue,
        origin: result.origin as unknown as Prisma.InputJsonValue,
        compliance: result.compliance as unknown as Prisma.InputJsonValue,
        tax: result.tax as unknown as Prisma.InputJsonValue,
        logistics: (result.logistics ?? {}) as unknown as Prisma.InputJsonValue,
        landedCost: result.landed as unknown as Prisma.InputJsonValue,
        statusSummary: {
          statuses: result.statuses,
          web: result.web,
          fx: result.fx,
          nomenclature: result.nomenclature,
          sources: result.sources,
          // The judgement around the ranking — how much of the probability mass
          // is deliberately NOT assigned, and why the top share was capped.
          classification: {
            mode: result.classification.mode,
            status: result.classification.status,
            residualPct: result.classification.residualPct,
            capReasons: result.classification.capReasons,
            userCheck: result.classification.userCheck,
          },
        } as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
      select: { id: true },
    });

    const candidateIds = new Map<string, string>();
    const all = [...result.classification.candidates];
    const selected = result.classification.selected;
    if (selected && !all.some((c) => c.gtip === selected.gtip)) all.unshift(selected);
    for (const [i, c] of all.entries()) {
      const row = await tx.importClassificationCandidate.create({
        data: {
          caseId: created.id,
          rank: i,
          gtip: c.gtip,
          gtipDescription: c.fullDescription || c.description,
          confidencePct: c.confidencePct,
          status: selected && c.gtip === selected.gtip ? selected.status : c.status,
          selected: !!selected && c.gtip === selected.gtip,
          rationale: { positive: c.positive, negative: c.negative, missing: c.missing, siblings: c.siblings, whyLower: c.whyLower, conceptLabel: c.conceptLabel, headingText: c.headingText } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      candidateIds.set(c.gtip, row.id);
      for (const e of [...c.positive, ...c.negative, ...c.missing]) {
        await tx.importEvidence.create({
          data: {
            caseId: created.id,
            candidateId: row.id,
            sourceId: e.sourceKey ? sourceIds.get(e.sourceKey) ?? null : null,
            ruleId: null,
            area: e.area,
            kind: e.kind,
            polarity: e.polarity,
            provenance: e.provenance,
            text: e.text,
            detail: (e.detail ?? null) as Prisma.InputJsonValue,
          },
        });
      }
    }

    const caseEvidence = [...result.evidence, ...result.tax.lines.flatMap((l) => l.why.map((w) => ({ area: "TAX" as const, kind: "RULE" as const, polarity: "NEUTRAL" as const, provenance: l.provenance, text: `${l.label}: ${w}`, sourceKey: l.sourceKeys[0], ruleId: l.ruleIds[0] })))];
    if (caseEvidence.length > 0) {
      await tx.importEvidence.createMany({
        data: caseEvidence.map((e) => ({
          caseId: created.id,
          sourceId: e.sourceKey ? sourceIds.get(e.sourceKey) ?? null : null,
          ruleId: "ruleId" in e ? (e.ruleId as string | undefined) ?? null : null,
          area: e.area,
          kind: e.kind,
          polarity: e.polarity,
          provenance: e.provenance,
          text: e.text.slice(0, 4000),
          detail: ((e as { detail?: unknown }).detail ?? null) as Prisma.InputJsonValue,
        })),
      });
    }
    return created.id;
  }, { timeout: 30_000 });
}

/** A short, human line for the case list. */
export function caseHeadline(c: { productName: string; predictedGtip: string | null; userGtip: string | null; originCountry: string | null }): string {
  const code = c.userGtip ?? c.predictedGtip;
  return `${c.productName} · ${code ? formatGtip(code) : "GTİP yok"} · ${c.originCountry ? countryName(c.originCountry) : "menşe yok"}`;
}

export const SOURCE_KEYS = Object.keys(SOURCE_CATALOGUE);
