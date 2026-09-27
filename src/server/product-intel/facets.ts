/**
 * PRODUCT INTELLIGENCE — comparable facets (pure: no DB, no network).
 *
 * WHY THIS EXISTS AND WHY IT IS NOT import/attributes.ts
 *
 * Import Intelligence already turns a product's words into attributes with
 * provenance, and this module REUSES that — our own product is understood by
 * `extractAttributes`, exactly as the customs module understands it. What that
 * extractor does not do is answer the marketplace question: "how many of the
 * competing offers state the same thing?" That needs two properties a customs
 * classification has no reason to carry:
 *
 *   1. The SAME reader must run over a rival's title, because "we have USB-C"
 *      and "they have USB-C" have to be one measurement or the comparison is
 *      meaningless.
 *   2. A facet must be able to say "this text does not state this at all",
 *      which is the entire basis of an honest denominator (see gap.ts).
 *
 * It also adds a few facets a customs code never needs but a marketplace
 * listing lives on — speed settings, a digital display, mAh.
 *
 * Everything here reads NORMALIZED text (import/text.ts `normalizeText`): lower
 * case, no diacritics, no punctuation. So "USB-C" arrives as "usb c", and every
 * pattern below is written for that form.
 */

import { normalizeText } from "../import/text";
import type { ProductAttributes } from "../import/attributes";
import type { Provenance } from "./types";

/**
 * CATEGORICAL: two offers match when they state the same value.
 * NUMERIC_HIGHER_BETTER: a rival "matches" when its number is at least ours —
 * comparing 4000 mAh with 3800 mAh for exact equality would call every capacity
 * unique and turn every product into a fake differentiator.
 */
export type FacetKind = "CATEGORICAL" | "NUMERIC_HIGHER_BETTER";

export type FacetDef = {
  key: string;
  label: string;
  kind: FacetKind;
  unit?: string;
  /** Words meaning "this text discusses the facet", even where we cannot parse
   *  a value. Used ONLY for the diagnostic "mentioned but unreadable" count —
   *  never for the denominator, which is strictly "a value was read". */
  cues: string[];
  read: (normalized: string) => { value: string; num?: number } | null;
};

export type Facet = {
  key: string;
  label: string;
  kind: FacetKind;
  unit?: string;
  value: string;
  num?: number;
  provenance: Provenance;
  from: string;
};

function firstNumber(m: RegExpMatchArray | null): number | null {
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export const FACET_DEFS: FacetDef[] = [
  {
    key: "CONNECTOR",
    label: "Konnektör",
    kind: "CATEGORICAL",
    cues: ["usb", "type c", "typec", "micro", "lightning", "konnektor", "sarj girisi"],
    // Order matters: "micro usb" is tested before the bare "usb a", otherwise
    // every micro-USB product would be recorded as USB-A.
    read: (t) => {
      if (/\bmicro\s*usb\b/.test(t)) return { value: "Micro-USB" };
      if (/\b(?:usb\s*)?type\s*c\b/.test(t) || /\busb\s*c\b/.test(t) || /\btip\s*c\b/.test(t)) return { value: "USB-C" };
      if (/\busb\s*a\b/.test(t)) return { value: "USB-A" };
      if (/\blightning\b/.test(t)) return { value: "Lightning" };
      if (/\busb\b/.test(t)) return { value: "USB (tipi belirtilmemiş)" };
      return null;
    },
  },
  {
    key: "BATTERY_MAH",
    label: "Batarya kapasitesi",
    kind: "NUMERIC_HIGHER_BETTER",
    unit: "mAh",
    cues: ["mah", "pil", "batarya", "battery", "kapasite"],
    read: (t) => {
      const n = firstNumber(t.match(/(\d{3,6})\s*mah\b/));
      return n == null ? null : { value: `${n} mAh`, num: n };
    },
  },
  {
    key: "SPEED_LEVELS",
    label: "Kademe sayısı",
    kind: "NUMERIC_HIGHER_BETTER",
    unit: "kademe",
    cues: ["kademe", "seviye", "speed", "hiz ayari"],
    read: (t) => {
      const n = firstNumber(t.match(/(\d{1,2})\s*(?:kademeli|kademe|seviyeli|seviye|speed)\b/));
      return n == null || n < 1 || n > 30 ? null : { value: `${n} kademe`, num: n };
    },
  },
  {
    key: "DISPLAY",
    label: "Ekran",
    kind: "CATEGORICAL",
    cues: ["ekran", "gosterge", "display", "lcd", "led", "dijital"],
    read: (t) => {
      if (/\b(?:dijital|digital)\s*(?:ekran|gosterge|display)\b/.test(t)) return { value: "Dijital ekran" };
      if (/\blcd\b/.test(t)) return { value: "LCD ekran" };
      if (/\boled\b/.test(t)) return { value: "OLED ekran" };
      if (/\bled\s*(?:ekran|gosterge|display)\b/.test(t)) return { value: "LED gösterge" };
      return null;
    },
  },
  {
    key: "POWER_W",
    label: "Güç",
    kind: "NUMERIC_HIGHER_BETTER",
    unit: "W",
    cues: ["watt", "guc", "power"],
    read: (t) => {
      const n = firstNumber(t.match(/(\d{1,5})\s*(?:watt|w)\b/));
      return n == null || n <= 0 ? null : { value: `${n} W`, num: n };
    },
  },
  {
    key: "VOLTAGE",
    label: "Voltaj",
    kind: "CATEGORICAL",
    cues: ["volt", "vdc", "gerilim"],
    read: (t) => {
      const m = t.match(/(\d{1,3})\s*(?:volt|v)\b/);
      return m && m[1] ? { value: `${m[1]} V` } : null;
    },
  },
  {
    key: "RECHARGEABLE",
    label: "Enerji",
    kind: "CATEGORICAL",
    cues: ["sarj", "sarjli", "rechargeable", "pilli", "kablolu", "adaptor"],
    read: (t) => {
      if (/\bsarj\s*edilebilir\b/.test(t) || /\bsarjli\b/.test(t) || /\brechargeable\b/.test(t)) return { value: "Şarjlı" };
      if (/\bpilli\b/.test(t) || /\bkalem\s*pil\b/.test(t)) return { value: "Pilli" };
      if (/\bkablolu\b/.test(t)) return { value: "Kablolu" };
      return null;
    },
  },
  {
    key: "WIRELESS",
    label: "Kablosuz bağlantı",
    kind: "CATEGORICAL",
    cues: ["bluetooth", "wifi", "wi fi", "kablosuz", "wireless"],
    read: (t) => {
      const has: string[] = [];
      if (/\bbluetooth\b/.test(t)) has.push("Bluetooth");
      if (/\bwi\s*fi\b/.test(t) || /\bwifi\b/.test(t) || /\bwlan\b/.test(t)) has.push("Wi-Fi");
      return has.length > 0 ? { value: has.join(" + ") } : null;
    },
  },
  {
    key: "MATERIAL",
    label: "Malzeme",
    kind: "CATEGORICAL",
    cues: ["plastik", "celik", "aluminyum", "ahsap", "cam", "silikon", "abs", "paslanmaz"],
    read: (t) => {
      const table: Array<[RegExp, string]> = [
        [/\bpaslanmaz\s*celik\b|\binox\b|\bstainless\b/, "Paslanmaz çelik"],
        [/\baluminyum\b|\baluminium\b|\baluminum\b/, "Alüminyum"],
        [/\bsilikon\b|\bsilicone\b/, "Silikon"],
        [/\bahsap\b|\bbambu\b|\bwood\b/, "Ahşap"],
        [/\bcam\b|\bglass\b/, "Cam"],
        [/\babs\b|\bplastik\b|\bplastic\b|\bpolikarbonat\b/, "Plastik"],
        [/\bcelik\b|\bsteel\b/, "Çelik"],
      ];
      for (const [re, label] of table) if (re.test(t)) return { value: label };
      return null;
    },
  },
];

export function facetDef(key: string): FacetDef | null {
  return FACET_DEFS.find((f) => f.key === key) ?? null;
}

/**
 * Read every facet a text actually states.
 *
 * A facet the text does not state is ABSENT from the result — never present
 * with a zero, an empty string or a "no". That distinction is this module's
 * whole claim to honesty: gap.ts counts only what is here, and therefore can
 * never read silence as a negative.
 */
export function readFacets(
  normalized: string,
  provenance: Provenance = "WEB_EXTRACTED",
  from = "İlan metni",
): Facet[] {
  const out: Facet[] = [];
  for (const def of FACET_DEFS) {
    const hit = def.read(normalized);
    if (!hit) continue;
    out.push({ key: def.key, label: def.label, kind: def.kind, unit: def.unit, value: hit.value, num: hit.num, provenance, from });
  }
  return out;
}

/** Did this text discuss the facet at all, even unparseably? Diagnostic only. */
export function mentionsFacet(normalized: string, def: FacetDef): boolean {
  return def.cues.some((c) => normalized.includes(c));
}

/**
 * Our own product's facets.
 *
 * Read from the SAME normalized text the shared extractor built, so our side
 * and the rivals' side are measured with one ruler. Where `ProductAttributes`
 * already holds a provenance-carrying value for the same fact, that provenance
 * wins: something the user typed into a form field must not be reported as if
 * it had been read off a web page.
 */
export function ourFacets(attrs: ProductAttributes): Facet[] {
  const facets = readFacets(attrs.normalized, "USER_ENTERED", "Ürün girdisi");
  const byKey = new Map(facets.map((f) => [f.key, f]));

  const adopt = (key: string, prov: Provenance | undefined, from: string | undefined) => {
    const f = byKey.get(key);
    if (f && prov) {
      f.provenance = prov;
      if (from) f.from = from;
    }
  };
  adopt("BATTERY_MAH", attrs.battery?.provenance, attrs.battery?.from);
  adopt("POWER_W", attrs.powerW?.provenance, attrs.powerW?.from);
  adopt("VOLTAGE", attrs.voltage?.provenance, attrs.voltage?.from);
  if (attrs.wireless.length > 0) adopt("WIRELESS", attrs.wireless[0]!.provenance, attrs.wireless[0]!.from);
  if (attrs.materials.length > 0) adopt("MATERIAL", attrs.materials[0]!.provenance, attrs.materials[0]!.from);
  if (attrs.interfaces.length > 0) adopt("CONNECTOR", attrs.interfaces[0]!.provenance, attrs.interfaces[0]!.from);

  return facets;
}

/** Convenience for callers holding raw text rather than normalized text. */
export function readFacetsFromText(text: string, provenance: Provenance, from: string): Facet[] {
  return readFacets(normalizeText(text), provenance, from);
}
