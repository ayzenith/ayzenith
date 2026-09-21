/**
 * IMPORT INTELLIGENCE — product understanding (pure, no DB, no network).
 *
 * Turns whatever is known about a product — the user's own words, a pasted
 * datasheet, text read from a manufacturer page — into one normalized
 * ProductAttributes object. Every attribute keeps its provenance and the
 * sentence it was read from, so "why does the system think this is wireless?"
 * always has an answer. Nothing is filled in by default: an attribute that no
 * text states stays absent and is listed as missing.
 */

import type { Provenance } from "./types";
import { gtipDigits, isValidGtin, normalizeText, stems } from "./text";

export type TextSource = {
  text: string;
  provenance: Provenance;
  /** Human label of where the text came from: "Ürün adı", "Datasheet metni", a URL. */
  from: string;
  /** ImportSource.key when the text came from a stored web page. */
  sourceKey?: string;
  /** Tier of that source (3 manufacturer, 4 other) — used to rank conflicting values. */
  tier?: number;
};

export type Attr<T> = { value: T; provenance: Provenance; from: string; snippet?: string; sourceKey?: string };

export type Material = { material: string; label: string; pct: number | null };

export type ProductAttributes = {
  name: string;
  brand: Attr<string> | null;
  model: Attr<string> | null;
  mpn: Attr<string> | null;
  sku: Attr<string> | null;
  ean: (Attr<string> & { valid: boolean }) | null;
  materials: Attr<Material>[];
  construction: Attr<"KNITTED" | "WOVEN"> | null;
  constructionConflict: boolean;
  gender: Attr<"MEN" | "WOMEN" | "UNISEX" | "CHILD" | "BABY"> | null;
  electrical: Attr<boolean> | null;
  voltage: Attr<string> | null;
  powerW: Attr<number> | null;
  battery: Attr<string> | null;
  wireless: Attr<string>[];
  cellular: Attr<boolean> | null;
  frequency: Attr<string> | null;
  interfaces: Attr<string>[];
  partOrAccessory: Attr<boolean> | null;
  use: Attr<"CONSUMER" | "PROFESSIONAL"> | null;
  civilAircraft: Attr<boolean> | null;
  condition: Attr<"NEW" | "USED" | "REFURBISHED"> | null;
  speakerCount: Attr<number> | null;
  weightKg: Attr<number> | null;
  /** Every stem of every text, for tariff-wording matching. */
  stems: string[];
  /** Normalized full text, for phrase matching. */
  normalized: string;
  /** Normalized product name/title only — a match here outweighs one buried in a datasheet. */
  normalizedName: string;
  sources: Array<{ from: string; provenance: Provenance; sourceKey?: string; chars: number }>;
};

const MATERIALS: Array<{ key: string; label: string; words: string[] }> = [
  { key: "COTTON", label: "Pamuk", words: ["pamuk", "pamuklu", "cotton"] },
  { key: "POLYESTER", label: "Polyester", words: ["polyester", "poliester"] },
  { key: "POLYAMIDE", label: "Poliamid / naylon", words: ["polyamid", "polyamide", "poliamid", "nylon", "naylon"] },
  { key: "ELASTANE", label: "Elastan", words: ["elastan", "elastane", "spandex", "lycra", "likra"] },
  { key: "VISCOSE", label: "Viskon", words: ["viskon", "viscose", "rayon"] },
  { key: "WOOL", label: "Yün", words: ["yun", "wool", "merino", "kasmir", "cashmere"] },
  { key: "LINEN", label: "Keten", words: ["keten", "linen"] },
  { key: "SILK", label: "İpek", words: ["ipek", "silk"] },
  { key: "ACRYLIC", label: "Akrilik", words: ["akrilik", "acrylic"] },
  { key: "LEATHER", label: "Deri", words: ["deri", "leather", "hakiki deri", "genuine leather"] },
  { key: "STAINLESS_STEEL", label: "Paslanmaz çelik", words: ["paslanmaz celik", "stainless steel", "inox"] },
  { key: "STEEL", label: "Çelik / demir", words: ["celik", "steel", "demir", "iron", "dokum", "cast iron"] },
  { key: "ALUMINIUM", label: "Alüminyum", words: ["aluminyum", "aluminium", "aluminum"] },
  { key: "PLASTIC", label: "Plastik", words: ["plastik", "plastic", "abs", "polipropilen", "polypropylene", "polikarbonat", "polycarbonate", "pvc"] },
  { key: "SILICONE", label: "Silikon", words: ["silikon", "silicone"] },
  { key: "GLASS", label: "Cam", words: ["cam", "glass", "borosilikat", "borosilicate", "kristal"] },
  { key: "PORCELAIN", label: "Porselen", words: ["porselen", "porcelain", "bone china"] },
  { key: "CERAMIC", label: "Seramik", words: ["seramik", "ceramic", "stoneware"] },
  { key: "WOOD", label: "Ahşap", words: ["ahsap", "wood", "wooden", "bambu", "bamboo", "mdf", "kontrplak", "plywood"] },
  { key: "PAPER", label: "Kağıt / karton", words: ["kagit", "paper", "karton", "cardboard"] },
  { key: "RUBBER", label: "Kauçuk", words: ["kaucuk", "rubber"] },
];

/**
 * Composition statements come in four word orders ("95% cotton", "%100 pamuk",
 * "pamuk %80", "cotton 95%"), and a text usually sticks to one. Each order is
 * tried on its own and the reading whose shares add up closest to 100 wins —
 * mixing orders is how "pamuk %80 polyester %20" would turn into 80% polyester.
 */
const COMPOSITION_PATTERNS: Array<{ re: RegExp; pct: number; word: number }> = [
  { re: /(\d{1,3})\s*%\s*([a-z]+(?:\s[a-z]+)?)/g, pct: 1, word: 2 },
  { re: /%\s*(\d{1,3})\s*([a-z]+(?:\s[a-z]+)?)/g, pct: 1, word: 2 },
  { re: /([a-z]+(?:\s[a-z]+)?)\s*%\s*(\d{1,3})/g, pct: 2, word: 1 },
  { re: /([a-z]+(?:\s[a-z]+)?)\s+(\d{1,3})\s*%/g, pct: 2, word: 1 },
];

export function parseComposition(normalized: string): Array<{ material: string; label: string; pct: number; index: number }> {
  let best: Array<{ material: string; label: string; pct: number; index: number }> = [];
  let bestScore = -Infinity;
  for (const p of COMPOSITION_PATTERNS) {
    const found: typeof best = [];
    for (const m of normalized.matchAll(p.re)) {
      const pct = Number(m[p.pct]);
      const mat = findMaterial(m[p.word] ?? "");
      if (mat && pct > 0 && pct <= 100 && !found.some((f) => f.material === mat.key)) {
        found.push({ material: mat.key, label: mat.label, pct, index: m.index ?? 0 });
      }
    }
    if (found.length === 0) continue;
    const sum = found.reduce((s, f) => s + f.pct, 0);
    const score = found.length - Math.abs(100 - sum) / 25;
    if (score > bestScore) {
      best = found;
      bestScore = score;
    }
  }
  return best;
}

function findMaterial(word: string): (typeof MATERIALS)[number] | null {
  const w = word.trim();
  for (const m of MATERIALS) {
    for (const cand of m.words) {
      if (w === cand || w.startsWith(cand + " ") || w.endsWith(" " + cand) || w === cand + "lu" || w === cand + "li") return m;
    }
  }
  return null;
}

function snippetAround(text: string, index: number, len = 90): string {
  const start = Math.max(0, index - 30);
  return text.slice(start, start + len).replace(/\s+/g, " ").trim();
}

function has(n: string, phrases: string[]): string | null {
  for (const p of phrases) {
    const re = new RegExp(`(^|\\s)${p.replace(/\s+/g, "\\s+")}($|\\s)`);
    if (re.test(n)) return p;
  }
  return null;
}

type Found<T> = { value: T; src: TextSource; snippet?: string };

function first<T>(found: Array<Found<T>>): Attr<T> | null {
  if (found.length === 0) return null;
  // User words beat a web page; a manufacturer page (tier 3) beats a shop (tier 4).
  const rank = (s: TextSource) => (s.provenance === "USER_ENTERED" ? 0 : s.tier === 3 ? 1 : 2);
  const best = [...found].sort((a, b) => rank(a.src) - rank(b.src))[0]!;
  return { value: best.value, provenance: best.src.provenance, from: best.src.from, snippet: best.snippet, sourceKey: best.src.sourceKey };
}

function labeled(raw: string, labels: string[], valuePattern = "[A-Za-z0-9][A-Za-z0-9\\-_/\\.]{1,40}"): { value: string; index: number } | null {
  const re = new RegExp(`(?:${labels.join("|")})\\s*[:：#]?\\s*(${valuePattern})`, "i");
  const m = re.exec(raw);
  return m ? { value: m[1]!.trim(), index: m.index } : null;
}

export function extractAttributes(input: { name: string; brand?: string | null; model?: string | null; mpn?: string | null; ean?: string | null }, texts: TextSource[]): ProductAttributes {
  const all: TextSource[] = [{ text: input.name, provenance: "USER_ENTERED", from: "Ürün adı" }, ...texts.filter((t) => t.text.trim())];

  const brandF: Found<string>[] = [];
  const modelF: Found<string>[] = [];
  const mpnF: Found<string>[] = [];
  const skuF: Found<string>[] = [];
  const eanF: Found<string>[] = [];
  const materialsF: Found<Material>[] = [];
  const constructionF: Found<"KNITTED" | "WOVEN">[] = [];
  const genderF: Found<"MEN" | "WOMEN" | "UNISEX" | "CHILD" | "BABY">[] = [];
  const electricalF: Found<boolean>[] = [];
  const voltageF: Found<string>[] = [];
  const powerF: Found<number>[] = [];
  const batteryF: Found<string>[] = [];
  const wirelessF: Found<string>[] = [];
  const cellularF: Found<boolean>[] = [];
  const freqF: Found<string>[] = [];
  const ioF: Found<string>[] = [];
  const partF: Found<boolean>[] = [];
  const useF: Found<"CONSUMER" | "PROFESSIONAL">[] = [];
  const aircraftF: Found<boolean>[] = [];
  const conditionF: Found<"NEW" | "USED" | "REFURBISHED">[] = [];
  const speakerF: Found<number>[] = [];
  const weightF: Found<number>[] = [];

  const userSrc: TextSource = { text: "", provenance: "USER_ENTERED", from: "Form alanı" };
  if (input.brand?.trim()) brandF.push({ value: input.brand.trim(), src: { ...userSrc, from: "Marka alanı" } });
  if (input.model?.trim()) modelF.push({ value: input.model.trim(), src: { ...userSrc, from: "Model alanı" } });
  if (input.mpn?.trim()) mpnF.push({ value: input.mpn.trim(), src: { ...userSrc, from: "Üretici parça no alanı" } });
  if (input.ean?.trim()) eanF.push({ value: gtipDigits(input.ean), src: { ...userSrc, from: "EAN/GTIN alanı" } });

  for (const src of all) {
    const raw = src.text;
    const n = normalizeText(raw);

    const b = labeled(raw, ["marka", "brand", "üretici", "manufacturer"], "[A-Za-zÇĞİÖŞÜçğıöşü0-9][A-Za-zÇĞİÖŞÜçğıöşü0-9&\\- ]{1,30}?(?=[,;\\n]|$)");
    if (b) brandF.push({ value: b.value, src, snippet: snippetAround(raw, b.index) });
    const m = labeled(raw, ["model(?:\\s*no)?", "model number"]);
    if (m) modelF.push({ value: m.value, src, snippet: snippetAround(raw, m.index) });
    const p = labeled(raw, ["mpn", "part\\s*(?:no|number)", "parça\\s*no", "p/n", "ürün kodu", "product code"]);
    if (p) mpnF.push({ value: p.value, src, snippet: snippetAround(raw, p.index) });
    const s = labeled(raw, ["sku", "stok kodu"]);
    if (s) skuF.push({ value: s.value, src, snippet: snippetAround(raw, s.index) });
    for (const em of raw.matchAll(/(?:ean|gtin|upc|barkod|barcode)\s*[:#]?\s*(\d{8,14})/gi)) {
      eanF.push({ value: em[1]!, src, snippet: snippetAround(raw, em.index ?? 0) });
    }

    // Composition: "95% cotton 5% elastane", "%100 pamuk", "pamuk %80".
    for (const c of parseComposition(n)) {
      materialsF.push({ value: { material: c.material, label: c.label, pct: c.pct }, src, snippet: snippetAround(n, c.index) });
    }
    for (const mat of MATERIALS) {
      const hit = has(n, mat.words);
      if (hit && !materialsF.some((f) => f.value.material === mat.key)) {
        materialsF.push({ value: { material: mat.key, label: mat.label, pct: null }, src, snippet: hit });
      }
    }

    const knit = has(n, ["orme", "ormeli", "orgu", "knit", "knitted", "jersey", "triko", "penye", "interlock", "ribana"]);
    const woven = has(n, ["dokuma", "woven", "denim", "kot", "poplin", "gabardin", "oxford", "keten dokuma"]);
    if (knit) constructionF.push({ value: "KNITTED", src, snippet: knit });
    if (woven) constructionF.push({ value: "WOVEN", src, snippet: woven });

    const g =
      has(n, ["bebek", "baby", "infant", "0 24 ay"]) ? "BABY" :
      has(n, ["cocuk", "kids", "children", "child", "boys", "girls", "erkek cocuk", "kiz cocuk"]) ? "CHILD" :
      has(n, ["unisex"]) ? "UNISEX" :
      has(n, ["kadin", "bayan", "women", "womens", "ladies"]) ? "WOMEN" :
      has(n, ["erkek", "men", "mens"]) ? "MEN" : null;
    if (g) genderF.push({ value: g, src });

    const v = raw.match(/(\d{1,3}(?:[.,]\d)?)\s*(?:-\s*\d{1,3}\s*)?(v|volt)\b/i);
    if (v) voltageF.push({ value: v[0]!.replace(/\s+/g, " "), src, snippet: snippetAround(raw, v.index ?? 0) });
    const w = raw.match(/(\d{1,5}(?:[.,]\d+)?)\s*(w|watt)\b/i);
    if (w) {
      const val = Number(w[1]!.replace(",", "."));
      if (Number.isFinite(val)) powerF.push({ value: val, src, snippet: snippetAround(raw, w.index ?? 0) });
    }
    const bat = has(n, ["li ion", "lityum", "lithium", "li po", "lipo", "batarya", "battery", "pil", "sarj edilebilir", "rechargeable", "aku"]);
    const mah = raw.match(/(\d{2,6})\s*mah/i);
    if (mah) batteryF.push({ value: `${mah[1]} mAh`, src, snippet: snippetAround(raw, mah.index ?? 0) });
    else if (bat) batteryF.push({ value: bat, src, snippet: bat });

    if (has(n, ["bluetooth"]) || /\bbt\s?5(\.\d)?\b/i.test(raw)) wirelessF.push({ value: "Bluetooth", src, snippet: "bluetooth" });
    if (has(n, ["wi fi", "wifi", "wlan", "802 11"])) wirelessF.push({ value: "Wi-Fi", src, snippet: "wi-fi" });
    if (has(n, ["nfc"])) wirelessF.push({ value: "NFC", src, snippet: "nfc" });
    if (has(n, ["kablosuz", "wireless", "true wireless", "tws"]) && !wirelessF.some((x) => x.src === src)) {
      wirelessF.push({ value: "Kablosuz (türü belirtilmemiş)", src, snippet: "kablosuz" });
    }
    const cell = has(n, ["4g", "5g", "lte", "gsm", "esim", "sim kart", "sim card", "cellular", "hucresel"]);
    if (cell) cellularF.push({ value: true, src, snippet: cell });
    const fq = raw.match(/(\d+(?:[.,]\d+)?)\s*(ghz|mhz)/i);
    if (fq) freqF.push({ value: fq[0]!, src, snippet: snippetAround(raw, fq.index ?? 0) });
    for (const io of ["usb c", "usb", "hdmi", "aux", "3 5 mm", "jack", "lightning", "ethernet"]) {
      if (has(n, [io])) ioF.push({ value: io.toUpperCase(), src });
    }
    if (has(n, ["elektrik", "elektrikli", "electric", "electrical", "sarj", "charging", "adaptor", "adapter", "ac dc", "priz"]) || v || w || bat || mah) {
      electricalF.push({ value: true, src });
    }

    const part = has(n, ["yedek parca", "spare part", "spare parts", "replacement part", "aksam", "part for", "parts for", "aksesuar", "accessory", "accessories", "kilif", "case for"]);
    if (part) partF.push({ value: true, src, snippet: part });
    const pro = has(n, ["profesyonel", "professional", "endustriyel", "industrial", "sanayi tipi"]);
    if (pro) useF.push({ value: "PROFESSIONAL", src, snippet: pro });
    const air = has(n, ["sivil hava tasit", "sivil hava tasitlarinda", "civil aircraft"]);
    if (air) aircraftF.push({ value: true, src, snippet: air });
    const used = has(n, ["ikinci el", "kullanilmis", "second hand", "pre owned", "used condition"]) ? "USED" : has(n, ["yenilenmis", "refurbished"]) ? "REFURBISHED" : null;
    if (used) conditionF.push({ value: used, src, snippet: used === "USED" ? "kullanılmış / ikinci el" : "yenilenmiş" });

    const spk = n.match(/(\d)\s*(?:adet\s*)?(?:hoparlor|surucu|driver|speaker)/);
    if (spk) speakerF.push({ value: Number(spk[1]), src, snippet: spk[0] });
    if (has(n, ["cift hoparlor", "stereo hoparlor", "dual speaker", "2 way", "iki yollu"])) speakerF.push({ value: 2, src, snippet: "çift/stereo hoparlör" });

    const kg = raw.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|gr|gram|grams)\b/i);
    if (kg) {
      const val = Number(kg[1]!.replace(",", "."));
      const unit = kg[2]!.toLowerCase();
      const inKg = unit === "kg" ? val : val / 1000;
      if (Number.isFinite(inKg) && inKg > 0) weightF.push({ value: inKg, src, snippet: snippetAround(raw, kg.index ?? 0) });
    }
  }

  const eanAttr = first(eanF);
  const constructionValues = new Set(constructionF.map((c) => c.value));

  // Composition: keep percentage statements; a bare material word only when no
  // percentage statement names that material.
  const mats = new Map<string, Found<Material>>();
  for (const f of materialsF) {
    const prev = mats.get(f.value.material);
    if (!prev || (prev.value.pct == null && f.value.pct != null)) mats.set(f.value.material, f);
  }

  const allText = all.map((t) => t.text).join("\n");
  return {
    name: input.name.trim(),
    brand: first(brandF),
    model: first(modelF),
    mpn: first(mpnF),
    sku: first(skuF),
    ean: eanAttr ? { ...eanAttr, valid: isValidGtin(eanAttr.value) } : null,
    materials: [...mats.values()]
      .sort((a, b) => (b.value.pct ?? -1) - (a.value.pct ?? -1))
      .map((f) => ({ value: f.value, provenance: f.src.provenance, from: f.src.from, snippet: f.snippet, sourceKey: f.src.sourceKey })),
    construction: constructionValues.size === 1 ? first(constructionF) : null,
    constructionConflict: constructionValues.size > 1,
    gender: first(genderF),
    electrical: first(electricalF),
    voltage: first(voltageF),
    powerW: first(powerF),
    battery: first(batteryF),
    wireless: dedupe(wirelessF),
    cellular: first(cellularF),
    frequency: first(freqF),
    interfaces: dedupe(ioF),
    partOrAccessory: first(partF),
    use: first(useF),
    civilAircraft: first(aircraftF),
    condition: first(conditionF),
    speakerCount: first(speakerF),
    weightKg: first(weightF),
    stems: [...new Set(stems(allText))],
    normalized: normalizeText(allText),
    normalizedName: normalizeText(input.name),
    sources: all.map((t) => ({ from: t.from, provenance: t.provenance, sourceKey: t.sourceKey, chars: t.text.length })),
  };
}

function dedupe(found: Found<string>[]): Attr<string>[] {
  const seen = new Set<string>();
  const out: Attr<string>[] = [];
  for (const f of found) {
    if (seen.has(f.value)) continue;
    seen.add(f.value);
    out.push({ value: f.value, provenance: f.src.provenance, from: f.src.from, snippet: f.snippet, sourceKey: f.src.sourceKey });
  }
  // A named technology makes the generic "kablosuz" redundant.
  return out.length > 1 ? out.filter((a) => !a.value.startsWith("Kablosuz (")) : out;
}

/** The main material by stated share; null when no share was stated. */
/** A material named alongside its own more specific kind adds nothing: porcelain IS a ceramic. */
const MORE_SPECIFIC: Record<string, string> = { CERAMIC: "PORCELAIN", STEEL: "STAINLESS_STEEL" };

export function mainMaterial(a: ProductAttributes): Material | null {
  const withPct = a.materials.filter((m) => m.value.pct != null);
  if (withPct.length === 0) {
    const keys = new Set(a.materials.map((m) => m.value.material));
    const distinct = a.materials.filter((m) => !(MORE_SPECIFIC[m.value.material] && keys.has(MORE_SPECIFIC[m.value.material]!)));
    return distinct.length === 1 ? distinct[0]!.value : null;
  }
  return withPct.sort((x, y) => (y.value.pct ?? 0) - (x.value.pct ?? 0))[0]!.value;
}

export function isWireless(a: ProductAttributes): boolean {
  return a.wireless.length > 0;
}

/** True when the product text is too thin to classify responsibly on its own. */
export function isThinDescription(a: ProductAttributes): boolean {
  return a.stems.length < 3;
}
