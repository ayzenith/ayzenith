/**
 * PRODUCT INTELLIGENCE — Title Lab's deterministic gate (pure).
 *
 * WHAT THIS FILE IS FOR
 *
 * A language model writes the title drafts. This file decides whether any of
 * them may be shown. The dangerous failure of an AI-written product title is
 * not clumsy Turkish — it is a specification the product does not have. "6000
 * mAh" in a title for a 4000 mAh fan is a false advertisement, and no amount of
 * prompt discipline makes that impossible; arithmetic does.
 *
 * So every factual-looking claim is pulled out of the draft and checked against
 * the claims our OWN product text supports. Anything unsupported fails, and a
 * failed draft is recorded with its reason rather than quietly dropped — a
 * rejected title is evidence about the model, and the operator should see it.
 *
 * Claims are canonicalised ("4000mAh", "4000 mAh" and "4.000 mah" all become
 * `4000 mah`) so a match never depends on how someone typed a space.
 */

import { BANNED_TITLE_PHRASES } from "@/config/product-intel";
import { normalizeText, stem, tokenize } from "../import/text";

export type TitleViolationCode =
  | "EMPTY"
  | "TOO_LONG"
  | "BANNED_PHRASE"
  | "UNSUPPORTED_CLAIM"
  | "REPEATED_WORD";

export type TitleViolation = { code: TitleViolationCode; message: string; detail?: string };

export type TitleCandidate = {
  title: string;
  chars: number;
  rationale: string;
  /** Market keywords the draft actually used, for the "why this title" note. */
  usedKeywords: string[];
  claims: string[];
  violations: TitleViolation[];
  accepted: boolean;
};

/**
 * Patterns that turn a piece of text into checkable claims.
 *
 * `canon` builds the canonical form. Numeric units canonicalise to
 * `<number> <unit>`; named technologies canonicalise to themselves.
 */
const CLAIM_PATTERNS: Array<{ re: RegExp; canon: (m: RegExpMatchArray) => string }> = [
  { re: /(\d{2,6})\s*mah\b/g, canon: (m) => `${Number(m[1])} mah` },
  { re: /(\d{1,2})\s*(?:kademeli|kademe|seviyeli|seviye|speed)\b/g, canon: (m) => `${Number(m[1])} kademe` },
  { re: /(\d{1,5})\s*(?:watt|w)\b/g, canon: (m) => `${Number(m[1])} w` },
  { re: /(\d{1,3})\s*(?:volt|v)\b/g, canon: (m) => `${Number(m[1])} v` },
  { re: /(\d{1,5})\s*(?:ml|mililitre)\b/g, canon: (m) => `${Number(m[1])} ml` },
  { re: /(\d{1,4})\s*(?:litre|lt|l)\b/g, canon: (m) => `${Number(m[1])} l` },
  { re: /(\d{1,4})\s*(?:cm|santim)\b/g, canon: (m) => `${Number(m[1])} cm` },
  { re: /(\d{1,4})\s*(?:mm)\b/g, canon: (m) => `${Number(m[1])} mm` },
  { re: /(\d{1,3})\s*(?:inc|inch|)\s*(?:"|inc)\b/g, canon: (m) => `${Number(m[1])} inc` },
  { re: /(\d{1,4})\s*(?:gb|tb|mb)\b/g, canon: (m) => `${Number(m[1])} ${m[0].replace(/[\d\s]/g, "")}` },
  { re: /(\d{1,3})\s*(?:saat|hour)\b/g, canon: (m) => `${Number(m[1])} saat` },
  { re: /(\d{1,4})\s*(?:gram|gr|g)\b/g, canon: (m) => `${Number(m[1])} gram` },
  { re: /(\d{1,3})\s*(?:kg|kilo)\b/g, canon: (m) => `${Number(m[1])} kg` },
  { re: /\bmicro\s*usb\b/g, canon: () => "micro usb" },
  { re: /\b(?:usb\s*)?type\s*c\b|\busb\s*c\b|\btip\s*c\b/g, canon: () => "usb c" },
  { re: /\busb\s*a\b/g, canon: () => "usb a" },
  { re: /\blightning\b/g, canon: () => "lightning" },
  { re: /\bbluetooth\b/g, canon: () => "bluetooth" },
  { re: /\bwi\s*fi\b|\bwifi\b|\bwlan\b/g, canon: () => "wifi" },
  { re: /\b(?:dijital|digital)\s*(?:ekran|gosterge|display)\b/g, canon: () => "dijital ekran" },
  { re: /\blcd\b/g, canon: () => "lcd" },
  { re: /\boled\b/g, canon: () => "oled" },
  { re: /\bip\s*6[78]\b/g, canon: (m) => m[0].replace(/\s+/g, "") },
  { re: /\bsu\s*gecirmez\b|\bwaterproof\b/g, canon: () => "su gecirmez" },
  { re: /\bkatlanabilir\b|\bfoldable\b/g, canon: () => "katlanabilir" },
  { re: /\bsarj\s*edilebilir\b|\bsarjli\b|\brechargeable\b/g, canon: () => "sarjli" },
  { re: /\bpaslanmaz\s*celik\b|\bstainless\b/g, canon: () => "paslanmaz celik" },
];

/**
 * Every checkable claim a text makes. Works on raw text; normalisation happens
 * inside, so callers cannot forget it.
 *
 * Thousands separators are removed first: "4.000 mAh" and "4000 mAh" are the
 * same claim, and treating them as different would reject a correct title.
 */
export function extractClaims(text: string): string[] {
  const normalized = normalizeText(text).replace(/(\d)[.\s](?=\d{3}\b)/g, "$1");
  const found = new Set<string>();
  for (const { re, canon } of CLAIM_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    for (const m of normalized.matchAll(rx)) {
      const c = canon(m).trim();
      if (c && !/^\d+\s*$/.test(c)) found.add(c);
    }
  }
  return [...found].sort();
}

/**
 * Claims that follow necessarily from another claim.
 *
 * WHY THIS EXISTS, AND WHY IT IS DELIBERATELY TINY
 *
 * Without it the gate is too strict to be useful: a 4000 mAh fan is obviously
 * rechargeable, but if the operator never typed the word "şarjlı" then every
 * natural Turkish title gets rejected for using it, and the whole feature is
 * noise. The fix is not to loosen the check — it is to state the handful of
 * implications that are actually entailed, in one table, where they can be
 * argued with and tested.
 *
 * The bar for an entry here is ENTAILMENT, not likelihood. A stated battery
 * capacity entails a rechargeable product. A USB-C port does NOT entail one —
 * a mains-powered device can have a USB-C socket — so it is not here.
 */
const CLAIM_IMPLICATIONS: Array<{ when: RegExp; implies: string[]; because: string }> = [
  { when: /^\d+ mah$/, implies: ["sarjli"], because: "Belirtilmiş bir mAh kapasitesi, ürünün şarj edilebilir olduğunu gerektirir." },
];

/** The claims a product supports: the ones it states, plus the ones those entail. */
export function supportedClaimsFor(text: string): string[] {
  const stated = extractClaims(text);
  const all = new Set(stated);
  for (const claim of stated) {
    for (const rule of CLAIM_IMPLICATIONS) {
      if (rule.when.test(claim)) for (const implied of rule.implies) all.add(implied);
    }
  }
  return [...all].sort();
}

export type TitleCheckInput = {
  title: string;
  maxChars: number;
  /** Claims our own product text supports. Anything outside this fails. */
  supportedClaims: string[];
  /** Market keywords, used only to report which ones the draft picked up. */
  marketTerms?: string[];
  bannedPhrases?: string[];
};

export function validateTitle(input: TitleCheckInput): { claims: string[]; usedKeywords: string[]; violations: TitleViolation[] } {
  const violations: TitleViolation[] = [];
  const title = (input.title ?? "").trim();

  if (title === "") {
    return { claims: [], usedKeywords: [], violations: [{ code: "EMPTY", message: "Başlık boş." }] };
  }

  if (title.length > input.maxChars) {
    violations.push({
      code: "TOO_LONG",
      message: `Başlık ${title.length} karakter; bu pazaryeri için sınır ${input.maxChars}.`,
    });
  }

  const normalized = normalizeText(title);
  const banned = input.bannedPhrases ?? BANNED_TITLE_PHRASES;
  for (const phrase of banned) {
    if (normalized.includes(phrase)) {
      violations.push({ code: "BANNED_PHRASE", message: `Yasaklı/desteklenemez ifade: "${phrase}".`, detail: phrase });
    }
  }

  const claims = extractClaims(title);
  const supported = new Set(input.supportedClaims);
  for (const claim of claims) {
    if (!supported.has(claim)) {
      violations.push({
        code: "UNSUPPORTED_CLAIM",
        message: `Başlıkta geçen "${claim}" ürün bilgilerinde yok — doğrulanmamış iddia.`,
        detail: claim,
      });
    }
  }

  const stems = tokenize(title).map(stem);
  const counts = new Map<string, number>();
  for (const s of stems) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const [word, n] of counts) {
    if (n >= 3) {
      violations.push({ code: "REPEATED_WORD", message: `"${word}" başlıkta ${n} kez geçiyor.`, detail: word });
    }
  }

  const termSet = new Set(input.marketTerms ?? []);
  const usedKeywords = [...new Set(stems.filter((s) => termSet.has(s)))];

  return { claims, usedKeywords, violations };
}

/** Run every draft through the gate and keep the order the model proposed. */
export function checkTitleCandidates(
  drafts: Array<{ title: string; rationale: string }>,
  common: Omit<TitleCheckInput, "title">,
): TitleCandidate[] {
  return drafts.map((d) => {
    const r = validateTitle({ ...common, title: d.title });
    return {
      title: d.title.trim(),
      chars: d.title.trim().length,
      rationale: d.rationale,
      usedKeywords: r.usedKeywords,
      claims: r.claims,
      violations: r.violations,
      accepted: r.violations.length === 0,
    };
  });
}
