import "server-only";

import { db } from "@/lib/db";
import { getOsSettings } from "../os/settings";
import { nextCode } from "../os/sequence";
import { extractAttributes, type ProductAttributes, type TextSource } from "../import/attributes";
import { normalizeText } from "../import/text";
import type { LandedCost } from "../import/landed";
import {
  DEFAULT_RETURN_RATE_PCT,
  DEFAULT_TARGET_MARGIN_PCT,
  BANNED_TITLE_PHRASES,
  marketplaceMeta,
} from "@/config/product-intel";

import { draftTitles, interpretAnalysis } from "./ai";
import { computeConfidence, decideStatus } from "./confidence";
import { resolveCostBasis, type CostBasis } from "./cost-source";
import { ourFacets } from "./facets";
import { computeGapFindings, type GapFinding } from "./gap";
import { extractKeywords, type KeywordReport } from "./keywords";
import { computeMarketProfile, marketAnchors, type MarketProfile } from "./market";
import { parseOfferBlock, type OfferDraft } from "./offers";
import { computePriceStrategy, type PriceInputs, type PriceStrategy } from "./price";
import { buildEvidence, buildLaunchSkeleton, buildSwot, type LaunchSkeleton, type Swot } from "./swot";
import { checkTitleCandidates, supportedClaimsFor, type TitleCandidate } from "./title";
import type { AnalysisStatus, OfferView, PiEvidence, ScanStatus } from "./types";
import { readProductPage, pageCacheKey } from "./web";

/**
 * PRODUCT INTELLIGENCE — the orchestrator.
 *
 * The order below is the contract, and the gate at step 8 is the point of the
 * whole module: the AI is only reached once deterministic code has produced
 * something for it to describe. If the scan produced nothing, the analysis is
 * written anyway — with its status, its confidence of nearly zero, and its
 * ledger of what was attempted — because "we could not find out" is a result
 * the operator needs, not an error to swallow.
 *
 *   1 understand the product        (import/attributes.ts, reused unchanged)
 *   2 find the real cost            (cost-source.ts — average, landed, or none)
 *   3 take in competitor offers     (pasted / CSV / one URL; no crawling in V1)
 *   4 measure the market            (market.ts)
 *   5 measure the gaps              (gap.ts — readable denominators only)
 *   6 count the market's own words  (keywords.ts)
 *   7 price bands                   (price.ts)
 *   8 ── gate ── evidence, confidence, status
 *   9 AI phrasing + title drafts, every draft re-checked by title.ts
 *  10 freeze
 */

export type ProductAnalysisInput = {
  productName: string;
  description: string | null;
  specText: string | null;
  brand: string | null;
  model: string | null;
  mpn: string | null;
  ean: string | null;

  marketplace: string;
  marketCountry: string;
  channelId: string | null;
  itemId: string | null;
  importCaseId: string | null;

  /** Our own product page, read to enrich the attributes. */
  productUrl: string | null;
  /** Pasted or uploaded competitor rows. */
  competitorBlock: string | null;
  /** Individual competitor product pages to read, one request each. */
  competitorUrls: string[];

  userUnitCost: number | null;
  shipping: number;
  packaging: number;
  returnRatePct: number | null;
  vatRatePct: number | null;
  commissionPct: number | null;
  adPerUnit: number;
  adPctOfPrice: number;
  otherOpsPerUnit: number;
  targetMarginPct: number | null;
};

export type ScanRecord = {
  marketplace: string;
  queryText: string | null;
  url: string | null;
  status: ScanStatus;
  blockKind: string | null;
  httpStatus: number | null;
  itemsFound: number;
  note: string | null;
  fromCache: boolean;
};

export type ScanScope = {
  scannedAt: string;
  marketplace: string;
  marketCountry: string;
  offersSubmitted: number;
  offersUsed: number;
  offersWithPrice: number;
  sourcesAttempted: number;
  sourcesFailed: number;
  parseSkipped: Array<{ line: number; text: string; reason: string }>;
  notes: string[];
};

export type AnalysisResult = {
  code: string;
  status: AnalysisStatus;
  attributes: ProductAttributes;
  costBasis: CostBasis;
  scanScope: ScanScope;
  market: MarketProfile;
  gapFindings: GapFinding[];
  keywords: KeywordReport;
  price: PriceStrategy;
  swot: Swot;
  launch: LaunchSkeleton;
  titles: TitleCandidate[];
  evidence: PiEvidence[];
  confidence: { score: number; components: Array<{ key: string; label: string; points: number; maxPoints: number; note: string }> };
  offers: OfferView[];
  scans: ScanRecord[];
  aiSummary: string | null;
  aiLaunchNarrative: string | null;
  aiDisabledNote: string | null;
};

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Everything the offer knows about itself, as one normalized string. */
function offerText(o: OfferDraft): string {
  return normalizeText([o.title, o.brand, o.rawExcerpt].filter(Boolean).join(" "));
}

export async function runProductAnalysis(
  input: ProductAnalysisInput,
  opts: { persist: boolean; userId?: string },
): Promise<{ result: AnalysisResult; analysisId: string | null }> {
  const settings = await getOsSettings();
  const base = settings.baseCurrency;
  const meta = marketplaceMeta(input.marketplace);
  const scans: ScanRecord[] = [];
  const scopeNotes: string[] = [];

  // ---------------------------------------------------------------- 1. product
  const texts: TextSource[] = [];
  if (input.description?.trim()) texts.push({ text: input.description, provenance: "USER_ENTERED", from: "Açıklama" });
  if (input.specText?.trim()) texts.push({ text: input.specText, provenance: "USER_ENTERED", from: "Teknik özellikler" });

  if (input.productUrl?.trim()) {
    const page = await readProductPage(input.productUrl.trim());
    scans.push({
      marketplace: input.marketplace,
      queryText: "Kendi ürün sayfamız",
      url: page.url,
      status: page.status,
      blockKind: page.blockKind,
      httpStatus: page.httpStatus,
      itemsFound: page.product ? 1 : 0,
      note: page.note,
      fromCache: page.fromCache,
    });
    if (page.product) {
      texts.push({
        text: [page.product.title, page.product.description, page.product.text].filter(Boolean).join("\n"),
        provenance: "WEB_EXTRACTED",
        from: page.url,
        sourceKey: pageCacheKey(page.url),
      });
    }
  }

  const attributes = extractAttributes(
    { name: input.productName, brand: input.brand, model: input.model, mpn: input.mpn, ean: input.ean },
    texts,
  );

  // ------------------------------------------------------------------- 2. cost
  const costBasis = await resolveCost(input, base);

  // ------------------------------------------------------- 3. competitor offers
  const drafts: OfferDraft[] = [];
  let submitted = 0;
  let parseSkipped: Array<{ line: number; text: string; reason: string }> = [];

  if (input.competitorBlock?.trim()) {
    const parsed = parseOfferBlock(input.competitorBlock, base, "USER_ENTERED");
    submitted += parsed.rows.length + parsed.skipped.length;
    drafts.push(...parsed.rows);
    scopeNotes.push(...parsed.notes);
    scans.push({
      marketplace: input.marketplace,
      queryText: "Elle girilen rakip listesi",
      url: null,
      status: parsed.rows.length > 0 ? "OK" : "EMPTY",
      blockKind: null,
      httpStatus: null,
      itemsFound: parsed.rows.length,
      note: parsed.skipped.length > 0 ? `${parsed.skipped.length} satır okunamadı.` : null,
      fromCache: false,
    });
    parseSkipped = parsed.skipped;
  }

  for (const rawUrl of input.competitorUrls.filter((u) => u.trim())) {
    const page = await readProductPage(rawUrl.trim());
    submitted += 1;
    scans.push({
      marketplace: input.marketplace,
      queryText: "Rakip ürün sayfası",
      url: page.url,
      status: page.status,
      blockKind: page.blockKind,
      httpStatus: page.httpStatus,
      itemsFound: page.product ? 1 : 0,
      note: page.note,
      fromCache: page.fromCache,
    });
    if (!page.product) continue;
    drafts.push({
      title: page.product.title ?? page.url,
      brand: page.product.brand,
      sellerName: null,
      price: null,
      currency: base,
      ratingAvg: null,
      ratingCount: null,
      sourceUrl: page.url,
      rawExcerpt: [page.product.title, page.product.description, page.product.text].filter(Boolean).join(" ").slice(0, 4000),
      provenance: "WEB_EXTRACTED",
    });
  }

  const offers: OfferView[] = drafts.map((d, i) => ({
    rank: i + 1,
    title: d.title,
    brand: d.brand,
    sellerName: d.sellerName,
    price: d.price,
    currency: d.currency,
    ratingAvg: d.ratingAvg,
    ratingCount: d.ratingCount,
    normalized: offerText(d),
    provenance: d.provenance,
    sourceUrl: d.sourceUrl,
  }));

  // ---------------------------------------------------------------- 4–7. measure
  const market = computeMarketProfile(offers, base);
  const facets = ourFacets(attributes);
  const gapFindings = computeGapFindings({
    ourFacets: facets,
    offers: offers.map((o) => ({ rank: o.rank, normalized: o.normalized })),
  });
  const keywords = extractKeywords({
    offers: offers.map((o) => ({ title: o.title, sellerName: o.sellerName })),
    ourText: [input.productName, input.description, input.specText].filter(Boolean).join(" "),
  });

  const priceInputs: PriceInputs = {
    shipping: input.shipping,
    packaging: input.packaging,
    returnRatePct: input.returnRatePct ?? DEFAULT_RETURN_RATE_PCT,
    vatRatePct: input.vatRatePct ?? (await defaultVatRate(input.itemId)) ?? 20,
    commissionPct: input.commissionPct ?? (await channelCommission(input.channelId)) ?? 0,
    commissionBase: meta.commissionBase,
    adPerUnit: input.adPerUnit,
    adPctOfPrice: input.adPctOfPrice,
    otherOpsPerUnit: input.otherOpsPerUnit,
    targetMarginPct: input.targetMarginPct ?? DEFAULT_TARGET_MARGIN_PCT,
  };
  const price = computePriceStrategy({ costBasis, inputs: priceInputs, marketPrices: offers.map((o) => o.price ?? 0), marketAnchors: marketAnchors(market) });

  // -------------------------------------------------------------- 8. the gate
  const swot = buildSwot({ gapFindings, market, price, keywords, costBasis });
  const launch = buildLaunchSkeleton({ gapFindings, market, price, keywords });
  const evidence = buildEvidence({ gapFindings, market, price, keywords, swot });
  const confidence = computeConfidence({ offerCount: offers.length, pricedCount: market.pricedCount, gapFindings, costBasis });

  const failedSources = scans.filter((s) => s.status !== "OK").length;
  const status = decideStatus({ offerCount: offers.length, attemptedSources: scans.length, failedSources });

  const scanScope: ScanScope = {
    scannedAt: new Date().toISOString(),
    marketplace: input.marketplace,
    marketCountry: input.marketCountry,
    offersSubmitted: submitted,
    offersUsed: offers.length,
    offersWithPrice: market.pricedCount,
    sourcesAttempted: scans.length,
    sourcesFailed: failedSources,
    parseSkipped,
    notes: scopeNotes,
  };

  // --------------------------------------------------------------- 9. the AI
  let aiSummary: string | null = null;
  let aiLaunchNarrative: string | null = null;
  let aiDisabledNote: string | null = null;
  let titles: TitleCandidate[] = [];

  if (status === "OK") {
    const narrative = await interpretAnalysis(buildFactSheet({ input, attributes, market, gapFindings, price, keywords, swot, launch, confidence }));
    aiSummary = narrative.summary;
    aiLaunchNarrative = narrative.launchNarrative;
    aiDisabledNote = narrative.disabledReason ?? null;

    const supportedClaims = supportedClaimsFor([input.productName, input.description, input.specText, ...facets.map((f) => f.value)].filter(Boolean).join(" "));
    const drafted = await draftTitles(buildTitleContext({ input, attributes, facets: facets.map((f) => `${f.label}: ${f.value}`), keywords, maxChars: meta.titleMaxChars }));
    if (drafted.disabledReason && !aiDisabledNote) aiDisabledNote = drafted.disabledReason;

    titles = checkTitleCandidates(drafted.drafts, {
      maxChars: meta.titleMaxChars,
      supportedClaims,
      marketTerms: keywords.terms.map((t) => t.term),
      bannedPhrases: BANNED_TITLE_PHRASES,
    });
  } else {
    aiDisabledNote =
      status === "BLOCKED"
        ? "Hiçbir kaynaktan veri alınamadığı için yorum üretilmedi."
        : "Veri yetersiz — yorum ve başlık üretilmedi.";
  }

  const result: AnalysisResult = {
    code: "",
    status,
    attributes,
    costBasis,
    scanScope,
    market,
    gapFindings,
    keywords,
    price,
    swot,
    launch,
    titles,
    evidence,
    confidence,
    offers,
    scans,
    aiSummary,
    aiLaunchNarrative,
    aiDisabledNote,
  };

  if (!opts.persist) return { result, analysisId: null };

  const analysisId = await persist(input, result, opts.userId);
  return { result, analysisId };
}

// ---------------------------------------------------------------------------
// Cost, commission and VAT come from the systems that own them. This module
// reads them; it never recomputes them.
// ---------------------------------------------------------------------------

async function resolveCost(input: ProductAnalysisInput, base: string): Promise<CostBasis> {
  let averageCost = null as Parameters<typeof resolveCostBasis>[0]["averageCost"];
  if (input.itemId) {
    const state = await db.itemCostState.findUnique({ where: { itemId: input.itemId } });
    if (state) {
      averageCost = {
        avgUnitCost: toNum(state.avgUnitCost),
        onHand: toNum(state.onHand) ?? 0,
        uncostedQty: toNum(state.uncostedQty) ?? 0,
      };
    }
  }

  let landed = null as Parameters<typeof resolveCostBasis>[0]["landed"];
  if (input.importCaseId) {
    const kase = await db.importCase.findUnique({ where: { id: input.importCaseId }, select: { landedCost: true } });
    const lc = kase?.landedCost as LandedCost | null;
    if (lc) {
      landed = {
        perUnitMin: toNum(lc.perUnitMin),
        perUnitMax: toNum(lc.perUnitMax),
        completeness: lc.completeness === "COMPLETE" ? "COMPLETE" : "PARTIAL",
        missing: Array.isArray(lc.missing) ? lc.missing : [],
        unchecked: Array.isArray(lc.unchecked) ? lc.unchecked : [],
      };
    }
  }

  return resolveCostBasis({ averageCost, landed, userUnitCost: input.userUnitCost, baseCurrency: base });
}

async function channelCommission(channelId: string | null): Promise<number | null> {
  if (!channelId) return null;
  const ch = await db.channel.findUnique({ where: { id: channelId }, select: { commissionRate: true } });
  return toNum(ch?.commissionRate);
}

async function defaultVatRate(itemId: string | null): Promise<number | null> {
  if (!itemId) return null;
  const item = await db.item.findUnique({ where: { id: itemId }, select: { vatRate: true } });
  return toNum(item?.vatRate);
}

// ---------------------------------------------------------------------------
// What the model is allowed to see. Measurements and their scope sentences —
// no raw offers, no unmeasured numbers.
// ---------------------------------------------------------------------------

function buildFactSheet(a: {
  input: ProductAnalysisInput;
  attributes: ProductAttributes;
  market: MarketProfile;
  gapFindings: GapFinding[];
  price: PriceStrategy;
  keywords: KeywordReport;
  swot: Swot;
  launch: LaunchSkeleton;
  confidence: { score: number };
}): string {
  const L: string[] = [];
  const meta = marketplaceMeta(a.input.marketplace);
  L.push(`Ürün: ${a.input.productName}`);
  L.push(`Pazaryeri: ${meta.label} (${a.input.marketCountry})`);
  L.push(`Veri güveni (kod tarafından hesaplandı): %${a.confidence.score}`);
  L.push(`Taranan rakip ilan sayısı: ${a.market.offerCount}; fiyatı okunabilen: ${a.market.pricedCount}`);
  L.push("");

  L.push("ÜRÜNÜN DOĞRULANMIŞ ÖZELLİKLERİ (yalnızca bunlar gerçektir):");
  const facets = ourFacets(a.attributes);
  if (facets.length === 0) L.push("- Karşılaştırılabilir teknik özellik çıkarılamadı.");
  for (const f of facets) L.push(`- ${f.label}: ${f.value}`);
  L.push("");

  if (a.market.priceStats) {
    const s = a.market.priceStats;
    L.push(`PAZAR FİYATLARI (${s.count} ilandan, ${a.market.currency}): en düşük ${s.min}, alt çeyrek ${s.p25}, medyan ${s.median}, üst çeyrek ${s.p75}, en yüksek ${s.max}`);
    for (const seg of a.market.segments) L.push(`- ${seg.label} ${seg.from}–${seg.to}: ${seg.count} ilan (%${seg.pct})`);
  } else {
    L.push("PAZAR FİYATLARI: okunamadı.");
  }
  if (a.market.rating) L.push(`PUAN/YORUM: ${a.market.rating.ratedCount} ilanda puan var, ortalama ${a.market.rating.avgRating}; yorum medyanı ${a.market.rating.medianReviewCount}, en yüksek ${a.market.rating.maxReviewCount}.`);
  if (a.market.sellerConcentrationPct != null) L.push(`SATICI YOĞUNLUĞU: en büyük üç satıcı ilanların %${a.market.sellerConcentrationPct}'ini tutuyor.`);
  L.push("");

  L.push("ÖZELLİK KAPSAMA ÖLÇÜMLERİ (paydası 'okunabilen ilan sayısı'dır — okunamayanlar hakkında konuşma):");
  if (a.gapFindings.length === 0) L.push("- Ölçüm yapılamadı.");
  for (const g of a.gapFindings) L.push(`- ${g.headline} | ${g.scopeSentence}${g.otherValues.length > 0 ? ` | Rakiplerde en yaygın: ${g.otherValues.map((v) => `${v.value} %${v.pct}`).join(", ")}` : ""}`);
  L.push("");

  L.push("FİYAT (maliyet tabanı: " + a.price.costBasis.label + (a.price.costBasis.isAssumption ? " — VARSAYIM, ölçülmedi" : "") + "):");
  if (a.price.status === "OK") {
    L.push(`- Başabaş fiyat: ${a.price.minProfitablePrice} ${a.market.currency}`);
    L.push(`- Hedef marj (%${a.price.inputs.targetMarginPct}) fiyatı: ${a.price.targetPrice ?? "ulaşılamıyor"}`);
    if (a.price.inputs.adPctOfPrice > 0 || a.price.inputs.adPerUnit > 0) {
      L.push(
        `- Reklam gideri hesaba DAHİL: ${a.price.inputs.adPerUnit} ${a.market.currency}/adet sabit + fiyatın %${a.price.inputs.adPctOfPrice}'i. Bu rakamlar operatörün girdiği VARSAYIMLARDIR, ölçülmedi.`,
      );
    }
    for (const s of a.price.scenarios) L.push(`- ${s.label}: fiyat ${s.price}, birim kâr ${s.profit}, marj %${s.marginPct} (${s.band})`);
  } else {
    L.push(`- Hesaplanamadı: ${a.price.costBasis.note}`);
  }
  for (const w of a.price.warnings) L.push(`- UYARI: ${w}`);
  L.push("");

  if (a.keywords.missingFromOurs.length > 0) {
    L.push("PAZARIN KULLANDIĞI, BİZDE OLMAYAN KELİMELER:");
    for (const k of a.keywords.missingFromOurs) L.push(`- ${k.display} (ilanların %${k.offerPct}'i, ${k.sellerCount} farklı satıcı)`);
    L.push("");
  }

  L.push("ÖLÇÜLMÜŞ SWOT MADDELERİ (yalnızca bunları kullan, yenisini ekleme):");
  const quad = (name: string, items: Array<{ text: string; basis: string }>) => {
    L.push(`${name}:`);
    if (items.length === 0) L.push("- (veri yok, boş bırakıldı)");
    for (const i of items) L.push(`- ${i.text} [${i.basis}]`);
  };
  quad("GÜÇLÜ", a.swot.strengths);
  quad("ZAYIF", a.swot.weaknesses);
  quad("FIRSAT", a.swot.opportunities);
  quad("TEHDİT", a.swot.threats);
  L.push("");

  L.push("BU ANALİZİN SÖYLEYEMEDİKLERİ:");
  for (const u of a.launch.unknowns) L.push(`- ${u}`);

  return L.join("\n");
}

function buildTitleContext(a: {
  input: ProductAnalysisInput;
  attributes: ProductAttributes;
  facets: string[];
  keywords: KeywordReport;
  maxChars: number;
}): string {
  const L: string[] = [];
  const meta = marketplaceMeta(a.input.marketplace);
  L.push(`Pazaryeri: ${meta.label}. Başlık karakter sınırı: ${a.maxChars}.`);
  L.push(`Ürün adı: ${a.input.productName}`);
  if (a.attributes.brand) L.push(`Marka: ${a.attributes.brand.value}`);
  L.push("");
  L.push("ÜRÜNÜN DOĞRULANMIŞ ÖZELLİKLERİ — başlıkta yalnızca bunları kullanabilirsin:");
  if (a.facets.length === 0) L.push("- (teknik özellik çıkarılamadı; başlıkta teknik değer kullanma)");
  for (const f of a.facets) L.push(`- ${f}`);
  L.push("");
  L.push("RAKİP BAŞLIKLARINDAN SAYILMIŞ KELİMELER (sıklığa göre):");
  for (const k of a.keywords.terms.slice(0, 25)) L.push(`- ${k.display} — ${k.sellerCount} satıcı, ilanların %${k.offerPct}'i`);
  L.push("");
  L.push(`${Math.min(5, 5)} başlık öner.`);
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Freeze. One transaction; the analysis and everything that explains it land
// together or not at all.
// ---------------------------------------------------------------------------

async function persist(input: ProductAnalysisInput, r: AnalysisResult, userId?: string): Promise<string> {
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "URA");
    const analysis = await tx.productAnalysis.create({
      data: {
        code,
        productName: input.productName,
        itemId: input.itemId,
        importCaseId: input.importCaseId,
        channelId: input.channelId,
        marketplace: input.marketplace,
        marketCountry: input.marketCountry,
        inputAttributes: r.attributes as unknown as object,
        scanScope: r.scanScope as unknown as object,
        marketProfile: r.market as unknown as object,
        gapFindings: r.gapFindings as unknown as object,
        titleCandidates: r.titles as unknown as object,
        priceStrategy: r.price as unknown as object,
        swot: r.swot as unknown as object,
        launchPlan: { skeleton: r.launch, narrative: r.aiLaunchNarrative } as unknown as object,
        dataConfidence: r.confidence.score,
        status: r.status,
        aiSummary: r.aiSummary,
        aiDisabledNote: r.aiDisabledNote,
        createdById: userId ?? null,
      },
    });

    if (r.offers.length > 0) {
      await tx.competitorOffer.createMany({
        data: r.offers.map((o) => ({
          analysisId: analysis.id,
          rank: o.rank,
          sourceUrl: o.sourceUrl,
          sourceKey: o.sourceUrl ? pageCacheKey(o.sourceUrl) : null,
          observedAt: new Date(),
          title: o.title,
          brand: o.brand,
          sellerName: o.sellerName,
          price: o.price,
          currency: o.currency,
          ratingAvg: o.ratingAvg,
          ratingCount: o.ratingCount,
          attributes: { normalized: o.normalized } as unknown as object,
          rawExcerpt: o.normalized.slice(0, 4000),
          provenance: o.provenance,
        })),
      });
    }

    if (r.evidence.length > 0) {
      await tx.productEvidence.createMany({
        data: r.evidence.map((e) => ({
          analysisId: analysis.id,
          area: e.area,
          kind: e.kind,
          polarity: e.polarity,
          provenance: e.provenance,
          text: e.text,
          detail: e.detail ? (e.detail as object) : undefined,
          sourceKey: e.sourceKey ?? null,
        })),
      });
    }

    if (r.scans.length > 0) {
      await tx.productScanSource.createMany({
        data: r.scans.map((s) => ({
          analysisId: analysis.id,
          marketplace: s.marketplace,
          queryText: s.queryText,
          url: s.url,
          status: s.status,
          blockKind: s.blockKind,
          httpStatus: s.httpStatus,
          itemsFound: s.itemsFound,
          note: s.note,
          fromCache: s.fromCache,
        })),
      });
    }

    r.code = code;
    return analysis.id;
  });
}
