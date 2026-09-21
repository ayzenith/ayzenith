/**
 * IMPORT INTELLIGENCE — GTİP classification model (pure, no DB, no network).
 *
 * What it is: an explainable scoring model. It combines
 *   (1) the built-in product-concept knowledge (concepts.ts, provenance
 *       INFERRED) — which heading a product of this kind usually belongs to and
 *       which attribute decides between subheadings, and
 *   (2) word overlap between the product's own text and the OFFICIAL tariff
 *       wording of every 12-digit line in the loaded nomenclature,
 * and returns ranked candidates with their evidence. It does not call any
 * language model or paid service.
 *
 * What it is not: a legal classification. `confidencePct` is a RELATIVE
 * confidence among the candidates this model considered, on the evidence it
 * had. It is capped whenever the evidence is thin, contradictory or missing a
 * deciding attribute, and whatever the cap removes is shown as an explicit
 * "listelenmeyen / belirlenemeyen" share instead of being handed to a guess.
 */

import { mainMaterial, type ProductAttributes } from "./attributes";
import { matchConcepts, tariffVocabulary, type ConceptMatch } from "./concepts";
import { checkGtipShape, formatGtip, normalizeText, stems } from "./text";
import type { ClassificationStatus, EvidenceItem } from "./types";

// ---------------------------------------------------------------------------
// Nomenclature index
// ---------------------------------------------------------------------------

export type RawNomLine = {
  code: string;
  level: number;
  description: string;
  fullDescription: string;
  unit?: string | null;
  legalRate474?: number | null;
};

export type NomLine = RawNomLine & { stems: string[]; specificStems: string[]; specificText: string };

export type NomenclatureIndex = {
  sourceKey: string;
  version: string | null;
  tr: Map<string, NomLine>;
  tr12ByPrefix6: Map<string, NomLine[]>;
  hs: Map<string, NomLine>;
  idf: Map<string, number>;
  postings6: Map<string, Set<string>>;
};

export function buildNomenclatureIndex(input: { sourceKey: string; version: string | null; tr: RawNomLine[]; hs: RawNomLine[] }): NomenclatureIndex {
  const tr = new Map<string, NomLine>();
  const hs = new Map<string, NomLine>();
  for (const l of input.tr) tr.set(l.code, { ...l, stems: [...new Set(stems(l.fullDescription))], specificStems: [], specificText: "" });
  for (const l of input.hs) hs.set(l.code, { ...l, stems: [...new Set(stems(l.fullDescription))], specificStems: [], specificText: "" });

  const tr12ByPrefix6 = new Map<string, NomLine[]>();
  for (const l of tr.values()) {
    if (l.level !== 12) continue;
    const p6 = l.code.slice(0, 6);
    // The words that distinguish this line from its 6-digit parent — the path below it.
    const parent = tr.get(p6);
    const specific = parent && l.fullDescription.startsWith(parent.fullDescription)
      ? l.fullDescription.slice(parent.fullDescription.length)
      : l.description;
    l.specificText = specific;
    l.specificStems = [...new Set(stems(specific))];
    const list = tr12ByPrefix6.get(p6) ?? [];
    list.push(l);
    tr12ByPrefix6.set(p6, list);
  }

  // Document frequency over 6-digit groups, so a word shared by a whole chapter weighs little.
  const postings6 = new Map<string, Set<string>>();
  const add = (stem: string, p6: string) => {
    const set = postings6.get(stem) ?? new Set<string>();
    set.add(p6);
    postings6.set(stem, set);
  };
  for (const l of tr.values()) if (l.level >= 6) for (const s of l.stems) add(s, l.code.slice(0, 6));
  for (const l of hs.values()) if (l.level === 6) for (const s of l.stems) add(s, l.code);
  const n6 = new Set([...tr12ByPrefix6.keys(), ...[...hs.values()].filter((l) => l.level === 6).map((l) => l.code)]).size || 1;
  const idf = new Map<string, number>();
  for (const [s, set] of postings6) idf.set(s, Math.log(1 + n6 / set.size));

  return { sourceKey: input.sourceKey, version: input.version, tr, tr12ByPrefix6, hs, idf, postings6 };
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type Candidate = {
  gtip: string;
  gtip6: string;
  description: string;
  fullDescription: string;
  headingText: string | null;
  confidencePct: number;
  status: ClassificationStatus;
  score: number;
  conceptId: string | null;
  conceptLabel: string | null;
  positive: EvidenceItem[];
  negative: EvidenceItem[];
  missing: EvidenceItem[];
  whyLower: string | null;
  siblings: Array<{ gtip: string; description: string; reason: string }>;
};

export type UserGtipCheck = {
  input: string;
  digits: string;
  shapeOk: boolean;
  shapeReason: string | null;
  existsInNomenclature: boolean;
  nomenclatureDescription: string | null;
  agreesWithModel: boolean | null;
  modelTop: string | null;
};

export type ClassificationResult = {
  mode: "PREDICT" | "USER";
  status: ClassificationStatus;
  selected: Candidate | null;
  candidates: Candidate[];
  residualPct: number;
  capReasons: string[];
  userCheck: UserGtipCheck | null;
  evidence: EvidenceItem[];
};

const MODEL_NOTE =
  "Kural tabanlı sınıflandırma modeli: yerleşik ürün bilgisi + resmi tarife metniyle kelime uyumu. Dil modeli veya ücretli servis kullanılmadı.";

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type Scored6 = {
  p6: string;
  conceptPart: number;
  textPart: number;
  concept: ConceptMatch | null;
  targetNote: string | null;
  conditionLabel: string | null;
  conditionState: boolean | null | undefined;
  matchedStems: string[];
};

function textScores(index: NomenclatureIndex, query: string[]): Map<string, { score: number; matched: string[] }> {
  const out = new Map<string, { score: number; matched: string[] }>();
  for (const q of new Set(query)) {
    const set = index.postings6.get(q);
    if (!set) continue;
    const w = index.idf.get(q) ?? 0;
    // A word found in hundreds of subheadings says almost nothing about which one.
    if (set.size > 400) continue;
    for (const p6 of set) {
      const cur = out.get(p6) ?? { score: 0, matched: [] };
      cur.score += w;
      cur.matched.push(q);
      out.set(p6, cur);
    }
  }
  return out;
}

function expandTo6(index: NomenclatureIndex, code: string): string[] {
  if (code.length >= 6) return index.tr12ByPrefix6.has(code.slice(0, 6)) ? [code.slice(0, 6)] : [];
  return [...index.tr12ByPrefix6.keys()].filter((p) => p.startsWith(code));
}

function conditionFactor(state: boolean | null | undefined, isDefault = false): number {
  if (state === undefined) return 1;
  if (state === true) return 1.25;
  if (state === null) return isDefault ? 0.9 : 0.6;
  return 0.12;
}

function headingOf(index: NomenclatureIndex, code: string): NomLine | null {
  return index.tr.get(code.slice(0, 4)) ?? null;
}

/** Material words as the Turkish tariff spells them, mapped to attribute materials. */
const TARIFF_MATERIAL_WORDS: Array<[RegExp, string[]]> = [
  [/(^|\s)pamuk/, ["COTTON"]],
  [/(^|\s)yun|hayvan kil/, ["WOOL"]],
  [/(^|\s)sentetik/, ["POLYESTER", "POLYAMIDE", "ACRYLIC", "ELASTANE"]],
  [/(^|\s)suni/, ["VISCOSE"]],
  [/(^|\s)keten/, ["LINEN"]],
  [/(^|\s)ipek/, ["SILK"]],
  [/(^|\s)paslanmaz/, ["STAINLESS_STEEL"]],
  [/(^|\s)aluminyum/, ["ALUMINIUM"]],
  [/(^|\s)porselen/, ["PORCELAIN"]],
  [/(^|\s)plastik/, ["PLASTIC"]],
];

function lineAgreement(ownNormalized: string, a: ProductAttributes): { factor: number; bonus: number; note: string | null } {
  let factor = 1;
  let bonus = 0;
  let note: string | null = null;
  const main = mainMaterial(a)?.material ?? null;
  const named = TARIFF_MATERIAL_WORDS.filter(([re]) => re.test(ownNormalized)).flatMap(([, keys]) => keys);
  if (main && named.length > 0) {
    if (named.includes(main)) bonus += 1;
    else {
      factor *= 0.25;
      note = "Satırın malzemesi ürünün ana malzemesiyle uyuşmuyor.";
    }
  }
  const g = a.gender?.value ?? null;
  const saysMen = /(^|\s)erkek/.test(ownNormalized);
  const saysWomen = /(^|\s)(kadin|kiz)/.test(ownNormalized);
  if (g === "MEN" && saysWomen && !saysMen) {
    factor *= 0.25;
    note = "Satır kadınlar için; ürün erkek.";
  } else if (g === "WOMEN" && saysMen && !saysWomen) {
    factor *= 0.25;
    note = "Satır erkekler için; ürün kadın.";
  } else if ((g === "MEN" && saysMen) || (g === "WOMEN" && saysWomen)) bonus += 0.5;
  // "…ait olduğu belirlenemeyen" is for goods whose gender CANNOT be told; this one's can.
  if ((g === "MEN" || g === "WOMEN") && /belirlenemeyen/.test(ownNormalized)) {
    factor *= 0.3;
    note = note ?? "Satır cinsiyeti belirlenemeyen eşya için; ürünün cinsiyeti belli.";
  }
  return { factor, bonus, note };
}

function pickLine(index: NomenclatureIndex, p6: string, a: ProductAttributes, query: Set<string>) {
  const lines = index.tr12ByPrefix6.get(p6) ?? [];
  const scored = lines.map((l) => {
    // The line's OWN words decide between siblings; words it inherits from a
    // parent node are shared with its siblings and count for much less.
    const own = normalizeText(l.description);
    const ownStems = new Set(stems(l.description));
    const hits = l.specificStems.filter((s) => query.has(s));
    let s = hits.reduce((acc, h) => acc + (index.idf.get(h) ?? 0) * (ownStems.has(h) ? 1 : 0.35), 0);
    const residual = /^digerleri?$/.test(own.trim()) || own.trim() === "";
    s += residual ? 0.6 : 0.15;
    const agree = lineAgreement(own, a);
    s = (s + agree.bonus) * agree.factor;
    const aircraft = /sivil hava tasit/.test(normalizeText(l.specificText));
    if (aircraft && !a.civilAircraft) s *= 0.05;
    return { line: l, score: s, hits, residual, aircraft, disagreement: agree.note };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored;
}

function capFor(a: ProductAttributes, top: Scored6 | undefined, concepts: ConceptMatch[], missingCount: number): { cap: number; reasons: string[] } {
  let cap = 0.92;
  const reasons: string[] = [];
  if (!top?.concept) {
    cap = Math.min(cap, 0.55);
    reasons.push("Ürün, sistemin tanıdığı bir ürün türüyle eşleşmedi; tahmin yalnızca tarife metni uyumuna dayanıyor.");
  }
  if (a.stems.length < 3) {
    cap = Math.min(cap, 0.5);
    reasons.push("Ürün açıklaması çok kısa.");
  }
  if (missingCount > 0) {
    cap = Math.max(0.35, cap - 0.12 * missingCount);
    reasons.push(`${missingCount} belirleyici bilgi eksik.`);
  }
  if (top?.concept && top.concept.negativeHits.length > 0) {
    cap = Math.min(cap, 0.5);
    reasons.push(`Metin başka bir ürüne işaret eden ifade içeriyor: "${top.concept.negativeHits.join('", "')}".`);
  }
  if (a.constructionConflict) {
    cap = Math.max(0.35, cap - 0.1);
    reasons.push("Metin hem örme hem dokuma diyor.");
  }
  if (top?.concept && concepts.length > 1) {
    const second = concepts.find((c) => c.concept.id !== top.concept!.concept.id);
    if (second && second.score >= top.concept.score * 0.8) {
      cap = Math.min(cap, 0.6);
      reasons.push(`Ürün metni iki farklı ürün türüne de uyuyor: ${top.concept.concept.label} / ${second.concept.label}.`);
    }
  }
  if (a.stems.length < 3 && !top?.concept) cap = Math.min(cap, 0.4);
  return { cap, reasons };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function classify(
  index: NomenclatureIndex,
  a: ProductAttributes,
  opts: { userGtip?: string | null; btbDeclared?: boolean; maxCandidates?: number } = {},
): ClassificationResult {
  const evidence: EvidenceItem[] = [];
  const concepts = matchConcepts(a);
  const vocab = tariffVocabulary(a);
  const query = new Set([...a.stems, ...vocab]);
  const text = textScores(index, [...query]);
  const maxText = Math.max(1, ...[...text.values()].map((t) => t.score));

  // 1. Candidate 6-digit subheadings.
  const byP6 = new Map<string, Scored6>();
  const upsert = (s: Scored6) => {
    const cur = byP6.get(s.p6);
    if (!cur || s.conceptPart + s.textPart > cur.conceptPart + cur.textPart) byP6.set(s.p6, s);
  };
  const topConceptScore = concepts[0]?.score ?? 0;
  for (const cm of concepts.filter((c) => c.score >= topConceptScore * 0.45).slice(0, 3)) {
    for (const t of cm.concept.targets) {
      const state = t.when ? t.when(a) : undefined;
      // A heading-level target spreads over its subheadings; only the few whose
      // wording fits the product go forward, or one heading floods the list.
      const p6s = expandTo6(index, t.code)
        .sort((x, y) => (text.get(y)?.score ?? 0) - (text.get(x)?.score ?? 0))
        .slice(0, 3);
      if (p6s.length === 0) {
        evidence.push({
          area: "CLASSIFICATION", kind: "NOTE", polarity: "NEUTRAL", provenance: "INFERRED",
          text: `${formatGtip(t.code)} yerleşik bilgi tablosunda var ama yüklü resmi tarife cetvelinde bulunamadı; aday yapılmadı.`,
        });
        continue;
      }
      for (const p6 of p6s) {
        const tx = text.get(p6);
        // Among the subheadings of a 4-digit target, the tariff wording decides.
        const bestTx = text.get(p6s[0]!)?.score ?? 0;
        const share = p6s.length > 1 ? 0.3 + 0.7 * ((tx?.score ?? 0) / Math.max(bestTx, 0.001)) : 1;
        upsert({
          p6,
          conceptPart: cm.score * t.weight * conditionFactor(state, t.default) * share,
          textPart: ((tx?.score ?? 0) / maxText) * 2,
          concept: cm,
          targetNote: t.note,
          conditionLabel: t.whenLabel ?? null,
          conditionState: state,
          matchedStems: tx?.matched ?? [],
        });
      }
    }
  }
  // Pure tariff-wording candidates: catch products the concept table does not know.
  const textTop = [...text.entries()].sort((x, y) => y[1].score - x[1].score).slice(0, 8);
  for (const [p6, tx] of textTop) {
    if (!index.tr12ByPrefix6.has(p6)) continue;
    if (byP6.has(p6)) continue;
    // One shared word ("pil", "mah") is noise, not an alternative.
    if (new Set(tx.matched).size < 2 || tx.score < maxText * 0.4) continue;
    upsert({ p6, conceptPart: 0, textPart: (tx.score / maxText) * 2 * (concepts.length > 0 ? 0.55 : 1), concept: null, targetNote: null, conditionLabel: null, conditionState: undefined, matchedStems: tx.matched });
  }

  const ranked6 = [...byP6.values()]
    .map((s) => {
      let total = s.conceptPart + s.textPart * 0.8;
      // A "parts of …" subheading is for parts; a whole product does not belong there.
      // ("…and parts thereof" in a heading's text is not a parts subheading.)
      const trLine = index.tr.get(s.p6);
      const hsLine = index.hs.get(s.p6);
      const partsLine = trLine
        ? /^aksam/.test(normalizeText(trLine.description))
        : /(^|;\s*)parts\b/i.test(hsLine?.description ?? "");
      if (partsLine && !a.partOrAccessory) total *= 0.4;
      // Tariff-wording-only candidates next to a product NAMED as a known type are long shots.
      if (!s.concept && concepts.some((c) => c.inName)) total *= 0.35;
      return { s, total };
    })
    .filter((x) => x.total > 0.05)
    .sort((x, y) => y.total - x.total)
    .slice(0, opts.maxCandidates ?? 5);

  // 2. Resolve each subheading to its 12-digit line.
  const top = ranked6[0]?.s;
  const topConcept = top?.concept?.concept ?? null;
  const missing: EvidenceItem[] = (topConcept?.requires ?? [])
    .filter((r) => !r.present(a))
    .map((r) => ({
      area: "CLASSIFICATION" as const, kind: "MISSING_INFO" as const, polarity: "NEGATIVE" as const, provenance: "INFERRED" as const,
      text: `Eksik bilgi: ${r.label}`, detail: { key: r.key },
    }));

  const candidates: Candidate[] = [];
  for (const { s, total } of ranked6) {
    const picked = pickLine(index, s.p6, a, query);
    const best = picked[0];
    if (!best) continue;
    const heading = headingOf(index, s.p6);
    const positive: EvidenceItem[] = [];
    const negative: EvidenceItem[] = [];

    if (s.concept) {
      positive.push({
        area: "CLASSIFICATION", kind: "CONCEPT_RULE", polarity: "POSITIVE", provenance: "INFERRED",
        text: `Ürün türü "${s.concept.concept.label}" olarak tanındı (eşleşen ifade: ${s.concept.matched.map((m) => `"${m.replace(/^=/, "")}"`).join(", ")}${s.concept.inName ? ", ürün adında" : ""}). ${s.targetNote ?? ""}`.trim(),
      });
      if (s.conditionState === true) {
        positive.push({ area: "CLASSIFICATION", kind: "MATCHING_ATTRIBUTE", polarity: "POSITIVE", provenance: "INFERRED", text: `Belirleyici özellik sağlanıyor: ${s.conditionLabel}` });
      } else if (s.conditionState === false) {
        negative.push({ area: "CLASSIFICATION", kind: "EXCLUSION", polarity: "NEGATIVE", provenance: "INFERRED", text: `Belirleyici özellik ürün metniyle çelişiyor: ${s.conditionLabel}` });
      } else if (s.conditionState === null) {
        negative.push({ area: "CLASSIFICATION", kind: "MISSING_INFO", polarity: "NEGATIVE", provenance: "INFERRED", text: `Bu alt pozisyonu belirleyen bilgi metinde yok: ${s.conditionLabel}` });
      }
      for (const n of s.concept.negativeHits) {
        negative.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "INFERRED", text: `Metinde başka bir ürüne işaret eden ifade var: "${n}"` });
      }
    }
    if (heading) {
      const headingHits = heading.stems.filter((x) => query.has(x));
      if (headingHits.length > 0) {
        positive.push({
          area: "CLASSIFICATION", kind: "HEADING_MATCH", polarity: "POSITIVE", provenance: "OFFICIAL", sourceKey: index.sourceKey,
          text: `Pozisyon metni ürünle uyumlu (${formatGtip(heading.code)}): "${heading.description.trim().slice(0, 220)}"`,
          detail: { matched: headingHits },
        });
      }
    }
    if (best.hits.length > 0) {
      positive.push({
        area: "CLASSIFICATION", kind: "TARIFF_WORDING", polarity: "POSITIVE", provenance: "OFFICIAL", sourceKey: index.sourceKey,
        text: `12 haneli satır metni ürün metniyle örtüşüyor: "${best.line.description.trim()}" (ortak kelimeler: ${best.hits.join(", ")})`,
      });
    } else if (best.residual) {
      positive.push({
        area: "CLASSIFICATION", kind: "TARIFF_WORDING", polarity: "NEUTRAL", provenance: "OFFICIAL", sourceKey: index.sourceKey,
        text: `12 haneli satır "Diğerleri" (artık) satırı seçildi: ürün, alt pozisyonun daha özel satırlarından hiçbirine uymuyor.`,
      });
    }
    const hs = index.hs.get(s.p6);
    if (hs) {
      const hsHits = hs.stems.filter((x) => query.has(x));
      if (hsHits.length > 0) {
        positive.push({
          area: "CLASSIFICATION", kind: "TARIFF_WORDING", polarity: "POSITIVE", provenance: "OFFICIAL", sourceKey: "WCO_HS2022_UN",
          text: `HS 2022 alt pozisyon metni (İngilizce) ürün metniyle örtüşüyor: "${hs.description.trim()}" (ortak: ${hsHits.join(", ")})`,
        });
      }
    }
    if (best.aircraft) {
      negative.push({ area: "CLASSIFICATION", kind: "EXCLUSION", polarity: "NEGATIVE", provenance: "OFFICIAL", sourceKey: index.sourceKey, text: "Seçilen satır sivil hava taşıtlarına mahsus; ürün metni bunu söylemiyor." });
    }
    if (best.disagreement) {
      negative.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "INFERRED", text: best.disagreement });
    }
    const siblings = picked.slice(1, 6).map((p) => ({
      gtip: p.line.code,
      description: p.line.description.trim(),
      reason: p.aircraft && !a.civilAircraft
        ? "Sivil hava taşıtlarına mahsus satır — ürün metni bunu söylemiyor."
        : p.disagreement
          ? p.disagreement
          : p.hits.length > 0
          ? `Daha az kelime uyumu (${p.hits.join(", ")}).`
          : "Bu satırı ayıran özellik ürün metninde geçmiyor.",
    }));

    candidates.push({
      gtip: best.line.code,
      gtip6: s.p6,
      description: best.line.description.trim(),
      fullDescription: best.line.fullDescription,
      headingText: heading?.description.trim() ?? null,
      confidencePct: 0,
      status: "AI_PREDICTED",
      score: total * (0.75 + 0.25 * Math.min(1, best.score / 2)),
      conceptId: s.concept?.concept.id ?? null,
      conceptLabel: s.concept?.concept.label ?? null,
      positive,
      negative,
      missing: s === top ? missing : [],
      whyLower: null,
      siblings,
    });
  }

  // 3. Relative confidence, capped by the quality of the evidence.
  const { cap, reasons } = capFor(a, top, concepts, missing.length);
  const exps = candidates.map((c) => Math.exp(c.score / 0.9));
  const sumExp = exps.reduce((x, y) => x + y, 0) || 1;
  let shares = exps.map((e) => e / sumExp);
  if (shares.length > 0 && shares[0]! > cap) {
    const others = shares.slice(1).reduce((x, y) => x + y, 0);
    const room = 1 - cap;
    const scale = others > room ? room / others : 1;
    shares = [cap, ...shares.slice(1).map((x) => x * scale)];
  }
  const pct = shares.map((x) => Math.round(x * 1000) / 10);
  const residualPct = Math.max(0, Math.round((100 - pct.reduce((x, y) => x + y, 0)) * 10) / 10);
  candidates.forEach((c, i) => {
    c.confidencePct = pct[i] ?? 0;
  });
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i]!;
    const t = candidates[0]!;
    const why: string[] = [];
    if (!c.conceptId && t.conceptId) why.push("ürün türü bilgisiyle desteklenmiyor, yalnız kelime uyumu var");
    if (c.negative.some((e) => e.kind === "EXCLUSION")) why.push("belirleyici özellik ürünle çelişiyor");
    if (c.negative.some((e) => e.kind === "MISSING_INFO")) why.push("belirleyici bilgi metinde yok");
    if (why.length === 0) why.push("ürün metniyle daha zayıf uyum");
    c.whyLower = `${formatGtip(t.gtip)} yerine daha düşük: ${why.join("; ")}.`;
  }

  if (a.constructionConflict) {
    evidence.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "INFERRED", text: "Kaynaklar çelişiyor: metinde hem 'örme' hem 'dokuma' geçiyor." });
  }
  if (a.stems.length < 3) {
    evidence.push({ area: "CLASSIFICATION", kind: "MISSING_INFO", polarity: "NEGATIVE", provenance: "INFERRED", text: "Ürün açıklaması çok kısa — teknik özellik, malzeme veya kullanım amacı ekleyin." });
  }
  evidence.push({ area: "CLASSIFICATION", kind: "NOTE", polarity: "NEUTRAL", provenance: "INFERRED", text: MODEL_NOTE });

  // 4. The user's own code (mode B) is checked, never silently replaced.
  let userCheck: UserGtipCheck | null = null;
  let selected: Candidate | null = candidates[0] ?? null;
  let status: ClassificationStatus = selected ? "AI_PREDICTED" : "INSUFFICIENT";
  if (opts.userGtip && opts.userGtip.trim()) {
    const shape = checkGtipShape(opts.userGtip);
    const line = shape.ok ? index.tr.get(shape.digits) : undefined;
    const modelTop = candidates[0]?.gtip ?? null;
    userCheck = {
      input: opts.userGtip.trim(),
      digits: shape.digits,
      shapeOk: shape.ok,
      shapeReason: shape.ok ? null : shape.reason,
      existsInNomenclature: !!line && line.level === 12,
      nomenclatureDescription: line?.fullDescription ?? null,
      agreesWithModel: modelTop ? modelTop.slice(0, 6) === shape.digits.slice(0, 6) : null,
      modelTop,
    };
    if (shape.ok) {
      const heading = headingOf(index, shape.digits);
      const own = candidates.find((c) => c.gtip === shape.digits);
      selected = {
        gtip: shape.digits,
        gtip6: shape.digits.slice(0, 6),
        description: line?.description.trim() ?? "(yüklü tarife cetvelinde bu kod yok)",
        fullDescription: line?.fullDescription ?? "",
        headingText: heading?.description.trim() ?? null,
        confidencePct: own?.confidencePct ?? 0,
        status: opts.btbDeclared ? "BTB_DECLARED" : "USER_ENTERED",
        score: own?.score ?? 0,
        conceptId: own?.conceptId ?? null,
        conceptLabel: own?.conceptLabel ?? null,
        positive: own?.positive ?? [],
        negative: own?.negative ?? [],
        missing: own?.missing ?? [],
        whyLower: null,
        siblings: own?.siblings ?? [],
      };
      status = selected.status;
      if (!userCheck.existsInNomenclature) {
        evidence.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "OFFICIAL", sourceKey: index.sourceKey, text: `Girilen GTİP ${formatGtip(shape.digits)} yüklü Türk Gümrük Tarife Cetveli'nde 12 haneli satır olarak yok.` });
      }
      if (userCheck.agreesWithModel === false) {
        evidence.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "AI_PREDICTED", text: `Model bu ürün için farklı bir alt pozisyon öneriyor: ${formatGtip(modelTop!)}. Girilen kodu doğrulayın.` });
      } else if (userCheck.agreesWithModel === true) {
        evidence.push({ area: "CLASSIFICATION", kind: "NOTE", polarity: "POSITIVE", provenance: "AI_PREDICTED", text: "Model de aynı 6 haneli alt pozisyonu öneriyor." });
      }
    } else {
      status = selected ? "AI_PREDICTED" : "INSUFFICIENT";
      evidence.push({ area: "CLASSIFICATION", kind: "CONFLICT", polarity: "NEGATIVE", provenance: "CALCULATED", text: `Girilen GTİP kullanılamadı: ${shape.reason} Model tahmini gösteriliyor.` });
    }
  }

  return {
    mode: opts.userGtip && opts.userGtip.trim() ? "USER" : "PREDICT",
    status,
    selected,
    candidates,
    residualPct,
    capReasons: reasons,
    userCheck,
    evidence,
  };
}
