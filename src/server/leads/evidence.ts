/**
 * AYZENITH LEAD FINDER — evidence & identity core.
 *
 * The accuracy-critical decisions of the module, extracted into ONE pure,
 * dependency-free place so they can be unit-tested and benchmarked without a
 * database, a network or a Next runtime. Deliberately NO `server-only`: this is
 * pure logic, and the whole point of moving it here is that `tests/` can import
 * it directly. Nothing in this file fetches, writes or reads anything.
 *
 * The doctrine it enforces, in one line: an ABSENCE of evidence is never
 * evidence, and it is never silently treated as "fine". A claim the pipeline
 * cannot support must come back as UNVERIFIED, not as a quiet pass.
 */

import { normalizeProduct } from "@/config/leads";

// ---------------------------------------------------------------------------
// Company identity
// ---------------------------------------------------------------------------

/** Legal-form and geography words that carry no identifying information. A firm
 *  called "ABC Deutschland GmbH" is identified by "abc", not by the other two. */
const ORG_FORM_STOPWORDS = new Set([
  "gmbh", "co", "kg", "ag", "ohg", "ug", "ek", "ltd", "inc", "gbr", "sarl", "sas",
  "sasu", "eurl", "srl", "srls", "spa", "snc", "sl", "slu", "sau", "sa", "bv", "nv",
  "vof", "bvba", "sprl", "lda", "oy", "oyj", "ab", "as", "aps", "kft", "zrt", "sro",
  "doo", "plc", "llc", "sti", "haftungsbeschrankt", "unipessoal", "und", "and",
  "group", "holding", "international", "deutschland", "germany", "europe", "europa",
]);

export function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length >= 3 && !ORG_FORM_STOPWORDS.has(t));
}

/**
 * Collapse the German ASCII digraphs so the two spellings of the same name
 * compare equal.
 *
 * `normalizeProduct` maps ü→u, but a domain or a registry entry writes the same
 * sound "ue" — so "Trüffelschwein" normalises to "truffelschwein" while its own
 * site is "trueffelschwein-shop.de", and the two never matched. Found by the
 * benchmark, not by reading the code: the domain silently stopped vouching for
 * the shop, which turned a harmless third-party name on the page into a false
 * MISMATCH. Applied to BOTH sides of every comparison, never to stored data.
 */
function foldGerman(s: string): string {
  return s.replace(/ue/g, "u").replace(/oe/g, "o").replace(/ae/g, "a");
}

/** The name with spaces and punctuation removed — the only comparable form left
 *  for a brand like "C&A" or "H&M", whose every token is too short to survive
 *  `significantTokens`. */
function compactName(name: string): string {
  return normalizeProduct(name).replace(/\s+/g, "");
}

export type NameComparison = "match" | "mismatch" | "inconclusive";

/**
 * Compare the name we believe a record is about against a name found on its
 * (supposed) own website.
 *
 * Token overlap is the primary test. The fix this carries over the previous
 * implementation is the FALLBACK: when either side has no significant tokens at
 * all — which is exactly what happens to two-letter brands, "C&A" normalising to
 * the useless ["c","a"] — the old code returned "inconclusive" and the whole
 * identity check switched itself off for precisely the case it was written for.
 * Now such names are compared in compact form instead, so a real disagreement is
 * still detectable. Comparison stays NEGATIVE-ONLY in spirit: it is used to
 * doubt an attribution, never to manufacture a positive one on its own.
 */
export function compareNames(candidateName: string, otherName: string): NameComparison {
  const a = significantTokens(foldGerman(normalizeProduct(candidateName)));
  const b = significantTokens(foldGerman(normalizeProduct(otherName)));
  if (a.length > 0 && b.length > 0) {
    const overlap = a.some((t) => b.some((u) => u.includes(t) || t.includes(u)));
    return overlap ? "match" : "mismatch";
  }

  // At least one side is all-short-tokens (a brand like C&A, H&M, S.Oliver).
  const ca = foldGerman(compactName(candidateName));
  const cb = foldGerman(compactName(otherName));
  if (ca.length < 2 || cb.length < 2) return "inconclusive";
  // "C&A" → "ca" inside "C&A Mode GmbH & Co. KG" → "camodegmbhcokg" ✓
  // "C&A" → "ca" against "Cunda Handels" → "cundahandels" ✗ (the real bug)
  if (cb.startsWith(ca) || ca.startsWith(cb) || cb.includes(ca) || ca.includes(cb)) return "match";
  return "mismatch";
}

/**
 * Does the site's own domain plausibly belong to this company?
 *
 * A domain match is real ownership evidence on its own — "raabkarcher.de" for
 * "Raab Karcher" — and it is what keeps a legitimate brand / legal-entity split
 * (franchise, holding company: "Raab Karcher" trading as "STARK Deutschland
 * GmbH") from being flagged as an impostor.
 *
 * Very short names are held to a STRICTER rule than long ones. Allowing "ca" to
 * match anywhere inside a domain would make "carl-anderson.de" look like C&A's
 * own site and re-open the hole this is here to close, so a sub-5-character name
 * must equal the domain core exactly.
 */
export function domainRelatesToName(domain: string | undefined | null, candidateName: string): boolean {
  if (!domain) return false;

  // EVERY label except the public suffix is a candidate, not just the first.
  // Taking `split(".")[0]` compared "Bang & Olufsen" against the label "stores"
  // of `stores.bang-olufsen.com` and concluded the brand's own store locator was
  // an unrelated site — found by the live dry run, and it would have demoted
  // every firm whose OSM website tag points at a subdomain.
  // Each label is kept BOTH whole and split on its hyphens. A hyphen in a domain
  // almost always separates the brand from a descriptor — "kik-textilien.com" is
  // KiK's own site — and without the split a short brand could never match it,
  // because a 3-letter name is (deliberately) required to equal a label outright.
  // Live dry run caught this: KiK read as an impostor on its own domain.
  const labels: string[] = [];
  for (const raw of domain.toLowerCase().split(".").slice(0, -1)) {
    if (raw === "www") continue;
    const whole = foldGerman(raw.replace(/[^a-z0-9]/g, ""));
    if (whole.length >= 2) labels.push(whole);
    if (raw.includes("-")) {
      for (const part of raw.split("-")) {
        const p = foldGerman(part.replace(/[^a-z0-9]/g, ""));
        if (p.length >= 2) labels.push(p);
      }
    }
  }
  if (labels.length === 0) return false;

  const tokens = significantTokens(foldGerman(normalizeProduct(candidateName))).filter((t) => t.length >= 4);
  if (labels.some((core) => tokens.some((t) => core.includes(t)))) return true;

  const compact = foldGerman(compactName(candidateName));
  if (compact.length >= 5 && labels.some((core) => core.includes(compact))) return true;
  // A name this short must equal a label outright — letting "ca" match anywhere
  // inside a domain would make "carl-anderson.de" look like C&A's own site.
  if (compact.length >= 2 && labels.some((core) => core === compact)) return true;
  return false;
}

/**
 * IDENTITY — is the website we read actually THIS company's website?
 *
 *  VERIFIED   — a name on the site (legal notice or the VIES register) names the
 *               same company we are looking at.
 *  PARTIAL    — no name confirmation, but the domain itself plausibly belongs to
 *               the company; or a name diverges while the domain still vouches
 *               for it (the normal brand / legal-entity split).
 *  MISMATCH   — a real, checkable disagreement, with nothing vouching for it.
 *  UNVERIFIED — nothing to go on at all: no legal name, no VIES name, and a
 *               domain unrelated to the name.
 *
 * UNVERIFIED is the state that did not exist before, and it is the important
 * one. The old check ran only `if (legalName)`, so a crawl that extracted NO
 * company name simply skipped identity and the lead proceeded to "Doğrulandı" —
 * measured on live data, 71 of 133 VERIFIED leads had no legal name at all, and
 * every cunda.de row filed under "C&A" is in that set. Not knowing whose site we
 * read is a finding, not a pass.
 */
export type IdentityStatus = "VERIFIED" | "PARTIAL" | "MISMATCH" | "UNVERIFIED";

export type IdentityInput = {
  candidateName: string;
  legalName?: string | null;
  viesName?: string | null;
  domain?: string | null;
  /** The site's own <title>, when available. Weakest of the name sources — it is
   *  marketing copy, not a disclosure — so it can support PARTIAL but never
   *  VERIFIED, and it is never used to declare a MISMATCH on its own. */
  websiteTitle?: string | null;
};

export type IdentityResult = {
  status: IdentityStatus;
  /** 0–100, how well-established the attribution is. Separate from lead score. */
  confidence: number;
  /** Human-readable, sourced reasons — rendered in the "why" panel. */
  reasons: string[];
};

export function resolveIdentity(input: IdentityInput): IdentityResult {
  const reasons: string[] = [];
  const domainOk = domainRelatesToName(input.domain, input.candidateName);
  if (domainOk) reasons.push(`Alan adı ("${input.domain}") firma adıyla bağdaşıyor.`);

  const legalCmp = input.legalName ? compareNames(input.candidateName, input.legalName) : null;
  const viesCmp = input.viesName ? compareNames(input.candidateName, input.viesName) : null;

  if (viesCmp === "match") {
    reasons.push(`VIES kayıtlı unvanı ("${input.viesName}") firma adıyla örtüşüyor.`);
    return { status: "VERIFIED", confidence: domainOk ? 100 : 92, reasons };
  }
  if (legalCmp === "match") {
    reasons.push(`Sitedeki yasal unvan ("${input.legalName}") firma adıyla örtüşüyor.`);
    return { status: "VERIFIED", confidence: domainOk ? 96 : 85, reasons };
  }

  const mismatched = legalCmp === "mismatch" || viesCmp === "mismatch";
  if (mismatched) {
    const other = viesCmp === "mismatch" ? input.viesName : input.legalName;
    if (domainOk) {
      // Brand vs registered entity. The domain vouches for ownership, so this is
      // a naming divergence, not an impostor.
      reasons.push(`Yasal unvan ("${other}") farklı ama alan adı firmaya ait görünüyor — marka/tüzel kişilik ayrımı olabilir.`);
      return { status: "PARTIAL", confidence: 65, reasons };
    }
    reasons.push(`Sitedeki yasal unvan ("${other}") aranan firma adıyla ("${input.candidateName}") örtüşmüyor ve alan adı da firmayla bağdaşmıyor — bu site başka bir işletmeye ait olabilir.`);
    return { status: "MISMATCH", confidence: 10, reasons };
  }

  // No name evidence either way.
  if (domainOk) {
    reasons.push("Yasal unvan okunamadı; kimlik yalnızca alan adına dayanıyor.");
    return { status: "PARTIAL", confidence: 60, reasons };
  }
  if (input.websiteTitle && compareNames(input.candidateName, input.websiteTitle) === "match") {
    reasons.push(`Site başlığı ("${input.websiteTitle}") firma adını içeriyor; yasal unvan doğrulanamadı.`);
    return { status: "PARTIAL", confidence: 50, reasons };
  }
  reasons.push("Sitede firmanın yasal kimliği doğrulanamadı ve alan adı firma adıyla bağdaşmıyor — bu sitenin bu firmaya ait olduğu teyit edilemedi.");
  return { status: "UNVERIFIED", confidence: 20, reasons };
}

// ---------------------------------------------------------------------------
// Product-fit capping by identity
// ---------------------------------------------------------------------------

export type ProductFit = "VERIFIED" | "LIKELY" | "UNCLEAR" | "NOT_RELEVANT" | "UNVERIFIED";

const FIT_ORDER: ProductFit[] = ["NOT_RELEVANT", "UNVERIFIED", "UNCLEAR", "LIKELY", "VERIFIED"];

function capFit(fit: ProductFit, ceiling: ProductFit): ProductFit {
  const i = FIT_ORDER.indexOf(fit);
  const c = FIT_ORDER.indexOf(ceiling);
  if (i < 0 || c < 0) return fit;
  return i > c ? ceiling : fit;
}

/**
 * What a lead is ALLOWED to claim about its product, given how sure we are that
 * the page we read belongs to it.
 *
 * Product evidence read off a site we cannot attribute is not evidence about
 * THIS company — it is evidence about whoever owns that site. So identity caps
 * the claim rather than adjusting a score behind the scenes: nothing is deleted,
 * the finding is stated, and the ceiling is visible.
 *
 * NOT_RELEVANT is never raised or lowered here — "we read the site and the
 * product is absent" is a conclusion about the page, not about the attribution.
 */
export function capProductFitByIdentity(fit: ProductFit, identity: IdentityStatus): ProductFit {
  if (fit === "NOT_RELEVANT" || fit === "UNVERIFIED") return fit;
  switch (identity) {
    case "VERIFIED":
    case "PARTIAL":
      return fit;
    case "UNVERIFIED":
      return capFit(fit, "LIKELY");
    case "MISMATCH":
      return capFit(fit, "UNCLEAR");
  }
}

// The uncurated-query tiering that pairs with this lives in `@/config/leads`
// (`tierUncuratedQuery`), because it is product VOCABULARY rather than identity
// logic — and keeping it there avoids an import cycle with this module.
