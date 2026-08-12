import { fmtUsd, fmtPct, BURDEN_LABELS, countryName } from "./ui";
import { concentrationBand } from "@/config/radar";

/**
 * AYZENITH RADAR — deterministic opportunity / risk derivation.
 *
 * Turns the frozen criterion data of a snapshot into plain-Turkish opportunities
 * and risks. Every line here is derived ONLY from the real, sourced numbers the
 * pipeline computed — no new figures, no AI. (The AI commentary, when present, is
 * shown separately and always labelled 🟡 Yorum.)
 */

export type TopSource = { cc: string; value: number; sharePct: number };

export type SnapshotCriterion = {
  key: string;
  score: number | null;
  available: boolean;
  rawInputs: Record<string, number | string | boolean | null | TopSource[]>;
  explanation: string;
};

export type SubCat = {
  hs6: string;
  productGroup: string;
  score: number;
  trendPct: number | null;
  latest: number;
  trToTarget?: number | null;
  trSharePct?: number | null;
};

function crit(criteria: SnapshotCriterion[], key: string): SnapshotCriterion | undefined {
  return criteria.find((c) => c.key === key);
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function deriveOpportunities(
  criteria: SnapshotCriterion[],
  subs: SubCat[],
): string[] {
  const out: string[] = [];
  const demand = crit(criteria, "demand");
  const growth = crit(criteria, "growth");
  const supply = crit(criteria, "supplyAdvantage");
  const comp = crit(criteria, "competition");

  const targetImport = num(demand?.rawInputs.targetImport);
  if (demand?.available && demand.score != null && demand.score >= 65 && targetImport != null) {
    out.push(`Yüksek ithalat hacmi — pazar ${fmtUsd(targetImport)} ithalat yapıyor.`);
  }
  const cagr = num(growth?.rawInputs.cagrPct);
  if (growth?.available && cagr != null && cagr >= 3) {
    // NOT "talep": import data measures import activity, not consumer demand.
    out.push(`Büyüyen ithalat aktivitesi — yıllık ortalama ithalat değişimi ${fmtPct(cagr)}.`);
  }
  const trExp = num(supply?.rawInputs.trToTargetExport);
  if (supply?.available && trExp != null && trExp > 0) {
    out.push(`Türkiye'nin mevcut ihracatı var — ${fmtUsd(trExp)} (kanal zaten açık).`);
  }
  if (supply?.rawInputs.euDutyFree === true) {
    out.push("Gümrük Birliği avantajı — Türk sanayi malları bu pazara vergisiz girebiliyor.");
  }
  const share = num(supply?.rawInputs.trSharePct);
  if (share != null && share > 0 && share < 15) {
    out.push(`Büyüme alanı geniş — Türkiye'nin pazar payı yalnızca %${share.toFixed(1).replace(".", ",")}.`);
  }
  if (comp?.available && comp.score != null && comp.score >= 60) {
    // Commercial MEANING backed by the real numbers (§5): name the top supplier
    // share + HHI. Never claim "easy to enter" — that isn't provable from
    // concentration alone (§12).
    const cTop = getTopSources(criteria)[0];
    const hhi = num(comp.rawInputs.concentrationHhi);
    if (cTop && hhi != null) {
      out.push(
        `Çeşitlendirilmiş tedarik yapısı — en büyük tedarikçi ülkenin (${countryName(cTop.cc)}) payı %${cTop.sharePct.toFixed(1).replace(".", ",")} ve yoğunlaşma endeksi ${hhi.toFixed(2).replace(".", ",")}; pazar tek bir ülkeye yoğunlaşmış görünmüyor.`,
      );
    } else {
      out.push("Çeşitlendirilmiş tedarik yapısı — ithalat birden fazla kaynak ülkeye dağılmış.");
    }
  }
  const risingSub = subs.find((s) => s.trendPct != null && s.trendPct >= 8);
  if (risingSub) {
    out.push(`Büyüyen alt kategori — ${risingSub.productGroup} (${fmtPct(risingSub.trendPct)}).`);
  }
  return out;
}

export function deriveRisks(
  criteria: SnapshotCriterion[],
  measuredCriteria: number,
  model: string = "B2B",
): string[] {
  const out: string[] = [];
  const growth = crit(criteria, "growth");
  const supply = crit(criteria, "supplyAdvantage");
  const entry = crit(criteria, "entry");
  const comp = crit(criteria, "competition");

  // Dominant supplier — flagged from the real source breakdown regardless of the
  // competition score, because "who dominates" is a commercial fact on its own.
  const top = getTopSources(criteria)[0];
  if (top && top.sharePct >= 35) {
    out.push(
      `${countryName(top.cc)} önemli bir tedarikçi konumunda — ithalatın %${top.sharePct.toFixed(1).replace(".", ",")}'i bu ülkeden geliyor; fiyat rekabeti sert olabilir.`,
    );
  } else if (comp?.available && comp.score != null && comp.score < 45) {
    if (top && top.sharePct >= 20) {
      out.push(
        `Tedarik yoğunlaşması — ithalatın %${top.sharePct.toFixed(1).replace(".", ",")}'i tek ülkeden (${countryName(top.cc)}) geliyor; fiyat rekabeti sert olabilir.`,
      );
    } else {
      out.push("Pazar yoğunlaşması — ithalat az sayıda ülkede toplanmış, rekabet sert olabilir.");
    }
  }
  const burden = entry?.rawInputs.certificationBurden;
  if (typeof burden === "string" && (burden === "high" || burden === "very-high")) {
    out.push(`Sertifikasyon yükü ${BURDEN_LABELS[burden] ?? burden} — düzenleyici giriş engelleri ciddi.`);
  }
  const duty = num(entry?.rawInputs.customsDutyPct);
  if (duty != null && duty > 0) {
    out.push(`Gümrük vergisi %${duty} — maliyet dezavantajı yaratabilir.`);
  }
  const cagr = num(growth?.rawInputs.cagrPct);
  if (growth?.available && cagr != null && cagr < 0) {
    out.push(`Daralan pazar — yıllık ithalat aktivitesi değişimi ${fmtPct(cagr)}.`);
  }
  const share = num(supply?.rawInputs.trSharePct);
  const trExp = num(supply?.rawInputs.trToTargetExport);
  if (share != null && share >= 25) {
    out.push(`Türkiye payı zaten yüksek (%${share.toFixed(1).replace(".", ",")}) — ek büyüme alanı sınırlı olabilir.`);
  } else if (supply?.available && share != null && share >= 0 && share < 3 && trExp != null) {
    // A REAL, measured low share (§6 risk). It is also headroom (shown in
    // opportunities). Only fires when TR export data was actually measured — a
    // missing datum is a data limitation, not a low share.
    out.push(`Türkiye'nin mevcut pazar payı düşük (%${share.toFixed(1).replace(".", ",")}) — pazarda henüz güçlü bir konum yok.`);
  }
  // NOTE: data-quality items (missing criteria, assumed duty, unverified TR
  // export, B2C unmeasured signals) are NOT risks — they live in
  // deriveDataLimitations() so a genuine commercial risk is never confused with
  // "we couldn't measure this" (§6). measuredCriteria/model kept for signature
  // stability; consumed there.
  void measuredCriteria; void model;
  return out;
}

/**
 * Data limitations (§1, §6) — what the analysis could NOT measure. Strictly
 * separate from commercial risks and conflicting signals. Missing data is stated
 * as "doğrulanamadı / ölçülmedi" and NEVER turned into a negative conclusion.
 */
export function deriveDataLimitations(
  criteria: SnapshotCriterion[],
  measuredCriteria: number,
  model: string = "B2B",
): string[] {
  const out: string[] = [];
  const supply = crit(criteria, "supplyAdvantage");
  const growth = crit(criteria, "growth");
  const comp = crit(criteria, "competition");
  const entry = crit(criteria, "entry");

  if (supply && !supply.available) {
    out.push("Türkiye ihracat verisi bu analizde doğrulanamadı — AYZENITH'in mevcut tedarik avantajı kesinleştirilemiyor.");
  }
  if (growth && !growth.available) {
    out.push("Büyüme trendi için yeterli yıllık veri doğrulanamadı — trend hakkında kesin sonuç yok.");
  }
  if (comp && !comp.available) {
    out.push("Kaynak ülke kırılımı doğrulanamadı — tedarik yoğunlaşması ölçülemedi.");
  }
  if (entry?.rawInputs.dutyAssumed === true) {
    out.push("Gümrük vergisi verisi doğrulanamadı — giriş kolaylığı varsayımla hesaplandı.");
  }
  if (measuredCriteria < 5) {
    out.push(`5 kriterin ${measuredCriteria}'i ölçülebildi — skor bu ölçüde temkinli okunmalı.`);
  }
  if (model === "B2C") {
    out.push("B2C tüketici göstergeleri (kişi başına gelir, e-ticaret penetrasyonu, nüfus, satın alma davranışı) V1'de doğrudan ölçülmedi — tüketici talebi hakkında kesin sonuç çıkarılamaz.");
  }
  return out;
}

/**
 * Deterministic commercial commentary when the AI layer is off. Goes beyond
 * "data → score" to "data → relationship → commercial meaning" (§9): it connects
 * the market size, Turkey's channel/share, the dominant supplier and the trend
 * into a short read — using ONLY the frozen numbers, inventing nothing.
 */
export function fallbackMeaning(
  decision: string,
  countryLabel: string,
  criteria: SnapshotCriterion[],
  model: string = "B2B",
): string {
  if (decision === "INSUFFICIENT_DATA") {
    return "Bu analiz güvenilir bir skor üretmek için yeterli veriye sahip değil.";
  }
  const demand = crit(criteria, "demand");
  const supply = crit(criteria, "supplyAdvantage");
  const growth = crit(criteria, "growth");
  const comp = crit(criteria, "competition");
  const targetImport = num(demand?.rawInputs.targetImport);
  const trExp = num(supply?.rawInputs.trToTargetExport);
  const share = num(supply?.rawInputs.trSharePct);
  const cagr = num(growth?.rawInputs.cagrPct);
  const hhi = num(comp?.rawInputs.concentrationHhi);
  const supplyAvail = supply?.available === true;
  const top = getTopSources(criteria)[0];

  // Build the commentary as: DATA → RELATIONSHIP → COMMERCIAL MEANING → DECISION.
  const parts: string[] = [];

  // 1. Market size + its relationship to the supply structure (a real signal).
  if (targetImport != null) {
    let s = `${countryLabel}'de ithalat hacmi ${fmtUsd(targetImport)} seviyesinde`;
    if (comp?.available && hhi != null) {
      const bandLabel = concentrationBand(hhi).label.toLocaleLowerCase("tr");
      if (hhi < 0.15) {
        s += ` ve tedarik yapısı ${bandLabel} gösteriyor — pazar tek bir tedarikçi ülkeye bağımlı değil, bu olumlu bir sinyal`;
      } else if (top && top.sharePct >= 35) {
        s += ` ancak tedarikte ${countryName(top.cc)} baskın konumda (%${top.sharePct.toFixed(1).replace(".", ",")}) — fiyat rekabeti sert olabilir`;
      } else {
        s += ` ve tedarik yapısı ${bandLabel} gösteriyor`;
      }
    }
    parts.push(s);
  } else {
    parts.push(`${countryLabel} bu kapsamda değerlendirildi`);
  }

  // 2. Growth — its commercial meaning (weak growth ⇒ don't prioritise on size alone).
  if (cagr != null) {
    if (cagr < 0) {
      parts.push(`ithalat aktivitesi daralıyor (${fmtPct(cagr)}); büyüklük, düşen trendi telafi etmeyebilir`);
    } else if (cagr >= 8) {
      parts.push(`ithalat aktivitesi büyüyor (${fmtPct(cagr)})`);
    } else {
      parts.push(`büyüme göstergesi zayıf (${fmtPct(cagr)}), bu nedenle yalnızca pazar büyüklüğüne dayanarak yüksek öncelik verilmemeli`);
    }
  } else if (growth && !growth.available) {
    parts.push("büyüme trendi bu analizde doğrulanamadı");
  }

  // 3. Turkey's position — MEASURED vs MISSING are different (§1). Never read a
  //    missing datum as "no channel".
  if (supplyAvail && trExp != null && trExp > 0 && share != null) {
    if (share < 3) {
      parts.push(`Türkiye'nin pazara mevcut bir ticaret kanalı var ancak payı düşük (%${share.toFixed(1).replace(".", ",")}), yani büyüme alanı geniş`);
    } else if (share >= 20) {
      parts.push(`Türkiye pazarda güçlü konumda (%${share.toFixed(1).replace(".", ",")} pay)`);
    } else {
      parts.push(`Türkiye'nin mevcut ihracat kanalı var (%${share.toFixed(1).replace(".", ",")} pay)`);
    }
  } else if (supplyAvail && trExp != null && trExp <= 0) {
    parts.push("ölçülen Türkiye ihracatı ~0, yani mevcut bir ticaret kanalı görünmüyor");
  } else {
    parts.push("Türkiye ihracat verisi bu analizde doğrulanamadığı için AYZENITH'in mevcut tedarik avantajı konusunda kesin bir sonuca varılamıyor");
  }

  const body = parts.join(". ") + ".";
  const tail =
    decision === "WORTH_RESEARCHING"
      ? " Ölçülen kriterler bu pazarı öncelikli araştırma adayı olarak işaret ediyor."
      : decision === "MONITOR"
        ? " Bazı sinyaller olumlu; öne çıkmadan önce izlenmesi daha doğru."
        : " Ölçülen kriterler şu an güçlü bir giriş gerekçesi sunmuyor.";
  const b2c =
    model === "B2C"
      ? " Bu B2C okuması ithalat ve ticaret verilerine dayanır; tüketici talebi doğrudan ölçülmedi."
      : "";
  return body + tail + b2c;
}

// ---------------------------------------------------------------------------
// Decision confidence (§11) — separate from DATA confidence. Data confidence
// says "how much was measured"; decision confidence says "is this enough to make
// a commercial call". Fully deterministic, no AI — explicit, auditable rules.
// ---------------------------------------------------------------------------

export type DecisionConfidence = {
  pct: number;
  band: "high" | "medium" | "low";
  label: string;
  reasons: string[];
};

export function decisionConfidence(
  criteria: SnapshotCriterion[],
  measuredCriteria: number,
  dataConfidence: number,
  model: string = "B2B",
): DecisionConfidence {
  let pct = 100;
  const reasons: string[] = [];

  const missing = Math.max(0, 5 - measuredCriteria);
  if (missing > 0) {
    pct -= missing * 12;
    reasons.push(`${missing} kriter ölçülemedi`);
  }
  const entry = crit(criteria, "entry");
  if (entry?.rawInputs.dutyAssumed === true) {
    pct -= 8;
    reasons.push("gümrük vergisi varsayıldı");
  }
  const growth = crit(criteria, "growth");
  if (growth?.rawInputs.anomaly === true) {
    pct -= 10;
    reasons.push("büyüme oranı olağandışı, doğrulama gerekli");
  }
  const conflicts = deriveConflicts(criteria).length;
  if (conflicts > 0) {
    pct -= Math.min(conflicts * 6, 18);
    reasons.push(`${conflicts} çelişkili sinyal var`);
  }
  // A CRITICAL commercial signal is entirely unmeasured in B2C (all consumer
  // indicators). This both lowers the number AND caps the band — a high label
  // would over-claim (§2).
  let criticalMissing = false;
  if (model === "B2C") {
    pct -= 25;
    criticalMissing = true;
    reasons.push("B2C tüketici göstergeleri ölçülmedi");
  }

  // Decision confidence can never exceed how much data actually backs the score.
  pct = Math.max(0, Math.min(pct, dataConfidence));
  // Bands (§2): 80–100 Yüksek · 60–79 Orta · 0–59 Düşük.
  let band: DecisionConfidence["band"] = pct >= 80 ? "high" : pct >= 60 ? "medium" : "low";
  // Cap: with a critical signal unmeasured, never label "Yüksek".
  if (criticalMissing && band === "high") band = "medium";
  const label = band === "high" ? "Yüksek" : band === "medium" ? "Orta" : "Düşük";
  if (reasons.length === 0) reasons.push("kritik ticari veriler ölçüldü, çelişki yok");
  return { pct, band, label, reasons };
}

// ---------------------------------------------------------------------------
// Next commercial action (§7, §13) — STRICTLY separated by business model. B2C
// must never recommend a B2B action (distributor/wholesaler) and vice-versa.
// ---------------------------------------------------------------------------

export type NextActions = { first: string; second: string; note: string };

export function decisionActions(
  model: string,
  decision: string,
  countryLabel: string,
  topProductName: string | null,
): NextActions {
  const prod = topProductName ? ` (özellikle ${topProductName})` : "";
  const note =
    "Not: RADAR V1 tedarikçi / distribütör / müşteri bulmaz. Yukarıdakiler sonraki araştırma adımları için yön önerisidir — yapılmış bir iş değildir.";

  if (decision === "NOT_PRIORITY") {
    return {
      first: "Kaynakları daha yüksek skorlu pazarlara ayırın; bu pazarı arada bir yeniden analiz edin.",
      second: "İzleme listesine alıp veri değiştikçe tekrar değerlendirin.",
      note,
    };
  }

  if (model === "B2C") {
    return {
      first: `${countryLabel} için e-ticaret / marketplace / online perakende kanallarında ürün-pazar uygunluğunu değerlendirin${prod}. Bu analizde tüketici talebi doğrudan ölçülmediği için kanal kararı kesinleştirilmemeli.`,
      second: "Tüketici tarafı göstergeleri (e-ticaret penetrasyonu, satın alma davranışı, gelir) doğrulanmadan pazara giriş taahhüt edilmemeli.",
      note,
    };
  }
  // B2B
  return {
    first: `${countryLabel}'deki ithalatçı / distribütör / toptancı (B2B ticari alıcı) tarafını araştırın${prod}.`,
    second: "Türkiye'deki uygun üretici / tedarikçi tarafını doğrulayın.",
    note,
  };
}

/**
 * Explain the gap between the market/overall score and the product's own
 * opportunity score (§3, §9): "pazarın iyi olması ≠ ürünün iyi olması". Purely
 * deterministic from the two already-computed scores — no new numbers.
 */
export function productVsMarketNote(
  marketScore: number | null,
  productScore: number | null,
  monitor: number,
  isProduct: boolean,
): string | null {
  if (marketScore == null || productScore == null) return null;
  const marketGood = marketScore >= monitor;
  const productWeak = productScore < monitor;
  if (marketGood && productWeak) {
    return isProduct
      ? "Ülke ve ticaret ortamı araştırmaya değer görünürken seçilen ürünün kendi göstergeleri daha zayıf. Bu nedenle ülke takip edilmeli, ancak bu ürün ilk öncelik olarak değerlendirilmemeli."
      : "Pazarın genel koşulları olumlu olsa da öne çıkan ürünün kendi büyüme ve ticaret göstergeleri güçlü bir öncelik sinyali vermiyor. Pazarın iyi olması, seçilen ürünün iyi olduğu anlamına gelmez.";
  }
  if (!marketGood && !productWeak) {
    return "Pazarın genel skoru sınırlı olsa da seçilen ürünün kendi göstergeleri görece güçlü — ürün bazında ayrıca değerlendirilebilir.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// V1.1 commercial intelligence — all deterministic, derived ONLY from the frozen
// snapshot criteria. Works on OLD snapshots too (they keep their stored score;
// these are read-time views), so nothing rewrites history.
// ---------------------------------------------------------------------------

/** Top source countries frozen on the competition criterion (may be empty). */
export function getTopSources(criteria: SnapshotCriterion[]): TopSource[] {
  const raw = crit(criteria, "competition")?.rawInputs.topSources;
  return Array.isArray(raw) ? (raw as TopSource[]) : [];
}

export type ConcentrationInfo = {
  hhi: number | null;
  bandKey: "low" | "medium" | "high";
  bandLabel: string;
  sources: number | null;
  top: TopSource[];
};

/** Supplier-concentration read: HHI → named band + the top suppliers. */
export function concentrationInfo(criteria: SnapshotCriterion[]): ConcentrationInfo | null {
  const comp = crit(criteria, "competition");
  if (!comp?.available) return null;
  const hhi = num(comp.rawInputs.concentrationHhi);
  const sources = num(comp.rawInputs.sources);
  const band = hhi != null ? concentrationBand(hhi) : { key: "low" as const, label: "—" };
  return { hhi, bandKey: band.key, bandLabel: band.label, sources, top: getTopSources(criteria) };
}

export type TwinScores = {
  marketOpportunity: number | null;
  ayzenithFit: number | null;
};

/**
 * Two perspectives on the SAME frozen criterion scores, using the SAME weights
 * the snapshot was scored with (renormalised over available criteria):
 *   • Market Opportunity = demand + growth + competition (is the MARKET good?)
 *   • AYZENITH Fit       = supply advantage + entry ease (can WE win it?)
 * No new data, no invented numbers — a re-view of what the engine already scored.
 */
export function splitScores(
  criteria: SnapshotCriterion[],
  weights: Record<string, number>,
): TwinScores {
  function blend(keys: string[]): number | null {
    let wsum = 0;
    let acc = 0;
    for (const k of keys) {
      const c = crit(criteria, k);
      if (!c?.available || c.score == null) continue;
      const w = weights[k] ?? 0;
      acc += c.score * w;
      wsum += w;
    }
    return wsum > 0 ? Math.round(acc / wsum) : null;
  }
  return {
    marketOpportunity: blend(["demand", "growth", "competition"]),
    ayzenithFit: blend(["supplyAdvantage", "entry"]),
  };
}

/**
 * Conflicting signals — where two real criteria point in opposite directions, so
 * a headline score is not read naively. Every line is grounded in frozen numbers.
 */
export function deriveConflicts(criteria: SnapshotCriterion[]): string[] {
  const out: string[] = [];
  const demand = crit(criteria, "demand");
  const growth = crit(criteria, "growth");
  const supply = crit(criteria, "supplyAdvantage");
  const comp = crit(criteria, "competition");

  const cagr = num(growth?.rawInputs.cagrPct);
  const compScore = comp?.available ? comp.score : null;
  const trShare = num(supply?.rawInputs.trSharePct);
  const trExp = num(supply?.rawInputs.trToTargetExport);
  const demandScore = demand?.available ? demand.score : null;

  // Growing market but concentrated suppliers → price competition risk.
  if (cagr != null && cagr >= 8 && compScore != null && compScore < 45) {
    out.push(
      "Pazar büyüyor ancak ithalat az sayıda tedarikçi ülkede yoğunlaşmış — büyüme tek başına fırsat sayılmamalı, fiyat rekabeti sert olabilir.",
    );
  }
  // Big import activity but Turkey has almost no channel. §1 CRITICAL: this may
  // ONLY fire when the TR export figure was actually MEASURED (~0). A missing
  // (unavailable) supply datum is NOT "no channel" — it is a data limitation and
  // is reported there instead. Never infer a negative from absent data.
  const supplyAvail = supply?.available === true;
  if (demandScore != null && demandScore >= 65 && supplyAvail && trExp != null && trExp <= 0) {
    out.push(
      "İthalat hacmi yüksek fakat ölçülen Türkiye ihracatı ~0 — yeni bir ticaret koridoru kurma ihtiyacı var.",
    );
  }
  // Turkey already strong but market shrinking.
  if (trShare != null && trShare >= 20 && cagr != null && cagr < 0) {
    out.push(
      `Türkiye'nin payı zaten yüksek (%${trShare.toFixed(1).replace(".", ",")}) ancak pazarın ithalatı daralıyor (${fmtPct(cagr)}) — mevcut konum korunmalı, büyüme beklentisi temkinli olmalı.`,
    );
  }
  // Large market that is shrinking.
  if (demandScore != null && demandScore >= 65 && cagr != null && cagr < 0) {
    out.push(
      `Pazar büyük fakat küçülüyor (ithalat ${fmtPct(cagr)}) — büyüklük, düşen trendi telafi etmeyebilir.`,
    );
  }
  return out;
}

/**
 * Data anomalies — unusual moves that must NOT be auto-read as opportunity, and
 * should be checked against the data year / source. Grounded in frozen inputs.
 */
export function deriveAnomalies(criteria: SnapshotCriterion[], subs: SubCat[]): string[] {
  const out: string[] = [];
  const growth = crit(criteria, "growth");
  if (growth?.rawInputs.anomaly === true) {
    const cagr = num(growth.rawInputs.cagrPct);
    out.push(
      `⚠ Büyüme oranı olağandışı${cagr != null ? ` (${fmtPct(cagr)})` : ""} — veri yılı / kaynak farkı olabilir; tek başına "çok iyi fırsat" olarak okunmamalı.`,
    );
  }
  for (const s of subs) {
    if (s.trendPct != null && Math.abs(s.trendPct) >= 120) {
      out.push(
        `⚠ ${s.productGroup}: olağandışı değişim (${fmtPct(s.trendPct)}) — doğrulanmalı.`,
      );
    }
  }
  return out.slice(0, 4);
}

export type RankedProduct = { sub: SubCat; reason: string };

/**
 * Split the product opportunities into "prioritise" and "not now", each with a
 * short data-grounded reason — NOT by market size alone, by the composite score.
 */
export function rankProducts(
  subs: SubCat[],
  monitor: number,
): { prioritize: RankedProduct[]; deprioritize: RankedProduct[] } {
  const prioritize: RankedProduct[] = [];
  const deprioritize: RankedProduct[] = [];
  for (const s of subs) {
    const bits: string[] = [];
    bits.push(`pazar ${fmtUsd(s.latest)}`);
    if (s.trendPct != null) bits.push(`trend ${fmtPct(s.trendPct)}`);
    if (s.trSharePct != null) bits.push(`TR payı %${s.trSharePct.toFixed(1).replace(".", ",")}`);
    const reason = bits.join(" · ");
    if (s.score >= monitor) prioritize.push({ sub: s, reason });
    else deprioritize.push({ sub: s, reason });
  }
  return { prioritize, deprioritize };
}

/** Parse the AI plain-text output into its parts (ÖZET / FIRSATLAR / RİSKLER). */
export function parseAiSummary(text: string | null | undefined): {
  ozet: string | null;
  firsatlar: string[];
  riskler: string[];
} {
  if (!text) return { ozet: null, firsatlar: [], riskler: [] };
  const lines = text.split("\n").map((l) => l.trim());
  let section: "ozet" | "firsatlar" | "riskler" | null = null;
  let ozet = "";
  const firsatlar: string[] = [];
  const riskler: string[] = [];
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith("ÖZET")) {
      section = "ozet";
      ozet += line.replace(/^ÖZET\s*:?/i, "").trim() + " ";
      continue;
    }
    if (up.startsWith("FIRSAT")) { section = "firsatlar"; continue; }
    if (up.startsWith("RİSK") || up.startsWith("RISK")) { section = "riskler"; continue; }
    if (!line) continue;
    const bullet = line.replace(/^[-•*]\s*/, "").trim();
    if (section === "ozet") ozet += line + " ";
    else if (section === "firsatlar" && bullet) firsatlar.push(bullet);
    else if (section === "riskler" && bullet) riskler.push(bullet);
  }
  return { ozet: ozet.trim() || null, firsatlar, riskler };
}
