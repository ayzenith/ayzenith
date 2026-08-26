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

// ---------------------------------------------------------------------------
// Page types
// ---------------------------------------------------------------------------

/**
 * What KIND of page a URL is. The pipeline previously knew only three states
 * (HIGH_VALUE / LOW_VALUE / NORMAL) and used just one of the distinctions — a
 * product page and a homepage counted identically toward product evidence,
 * which is how a single word anywhere on a site could verify a firm.
 */
export type PageType =
  | "PRODUCT"    // /products, /produkte, a category or item page
  | "CATALOG"    // a catalogue, price list or downloadable product document
  | "HOMEPAGE"
  | "ABOUT"
  | "TEAM"       // weak for product, valuable for identity/decision-makers
  | "CONTACT"
  | "BLOG"       // blog / news / press — talks ABOUT things, does not sell them
  | "CAREER"
  | "LEGAL"      // Impressum / statutory notice
  | "PRIVACY"    // privacy, cookie, terms — boilerplate
  | "OTHER";

/**
 * How much a product term found on this kind of page is worth, 0–1.
 *
 * Central and explicit on purpose: these are the numbers that decide whether a
 * firm gets called a seller, so they belong in one readable table rather than
 * scattered through the crawler. A term in a statutory notice is nearly
 * worthless as PRODUCT evidence ("wir liefern Stahl" in an Impressum says
 * nothing about a catalogue) while the same term on a category page is close to
 * proof.
 */
export const PAGE_TYPE_WEIGHT: Record<PageType, number> = {
  CATALOG: 1.0,
  PRODUCT: 1.0,
  HOMEPAGE: 0.6,
  OTHER: 0.5,
  ABOUT: 0.4,
  TEAM: 0.3,
  // Below the usable floor on purpose. A blog post or a press release DISCUSSES
  // a product — often a competitor's, or one the firm merely uses — and the
  // owner's brief names this as a negative signal, not a weak positive.
  BLOG: 0.2,
  CONTACT: 0.2,
  LEGAL: 0.15,
  PRIVACY: 0.15,
  CAREER: 0.15,
};

const CATALOG_PATH_RE =
  /\/(katalog|catalog|catalogue|catalogo|prospekt|preisliste|price[-_]?list|listino|downloads?|dokumente|documents|media|broschure|brochure)(?:\/|$|\.)/i;
const BLOG_PATH_RE = /\/(blog|news|nieuws|notizie|noticias|actualites|aktuelles|presse|press|magazin|magazine|journal|ratgeber)(?:\/|$|\.|-)/i;
const CAREER_PATH_RE = /\/(career|careers|jobs?|karriere|carriere|carrieres|carriera|empleo|vacatures|kariera|kariyer)(?:\/|$|\.|-)/i;
const TEAM_PATH_RE = /(\bteam\b|ansprechpartner|mitarbeiter|equipe|equipo|zespol|ekibimiz|management)/i;
const PRIVACY_PATH_RE = /\/(privacy|datenschutz|cookie|confidentialite|privacid|prywatnosci|gizlilik|tietosuoja|agb|terms|conditions|voorwaarden|regulamin)(?:\/|$|\.|-)/i;

/**
 * Classify a fetched page. `baseUrl` identifies the homepage, which cannot be
 * told from its path alone.
 *
 * Order matters and is deliberate: a PDF price list under /downloads is a
 * catalogue even though "downloads" is not a product word, and a blog post at
 * /blog/neue-kopfhoerer is a blog post even though it contains a product word.
 * Getting that precedence backwards is exactly how "product mentioned in a news
 * article" becomes "company sells product".
 */
export function classifyPageType(
  url: string,
  baseUrl: string,
  patterns: { product: RegExp; legal: RegExp; companyInfo: RegExp },
): PageType {
  const stripped = url.replace(/\/$/, "");
  if (stripped === baseUrl.replace(/\/$/, "")) return "HOMEPAGE";

  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep the raw string — classification is best-effort, never fatal */
  }

  // A downloadable document is catalogue-grade evidence wherever it sits.
  if (/\.pdf$/i.test(path) || CATALOG_PATH_RE.test(path)) return "CATALOG";
  // Blog/news/press BEFORE product: these pages discuss products they do not sell.
  if (BLOG_PATH_RE.test(path)) return "BLOG";
  if (CAREER_PATH_RE.test(path)) return "CAREER";
  if (patterns.legal.test(path)) return "LEGAL";
  if (PRIVACY_PATH_RE.test(path)) return "PRIVACY";
  if (patterns.product.test(path)) return "PRODUCT";
  if (TEAM_PATH_RE.test(path)) return "TEAM";
  if (/\/(kontakt|contact|contatti|contacto|iletisim|yhteystiedot)/i.test(path)) return "CONTACT";
  if (patterns.companyInfo.test(path)) return "ABOUT";
  return "OTHER";
}

// ---------------------------------------------------------------------------
// Negative signals
// ---------------------------------------------------------------------------

/**
 * Statements that CONTRADICT the reading that this firm sells the product.
 *
 * Scanned only in the text around a match, never across the whole site: a
 * webshop that happens to have one "wir sind kein Händler" sentence in an FAQ
 * about a different product line must not be written off wholesale.
 */
export type NegativeSignalKind =
  | "NOT_A_DISTRIBUTOR"   // "kein Vertrieb", "not a distributor"
  | "MANUFACTURER_ONLY"   // "nur Hersteller"
  | "SERVICE_ONLY"        // "reine Dienstleistung", "service only"
  | "PRIVATE_ONLY"        // "nur für Privatkunden" — no B2B channel
  | "THIRD_PARTY_BRAND"   // the term appears as someone else's brand
  | "DISCONTINUED";       // "nicht mehr im Sortiment"

export type NegativeSignal = { kind: NegativeSignalKind; evidence: string };

const NEGATIVE_PATTERNS: Array<{ kind: NegativeSignalKind; re: RegExp }> = [
  { kind: "NOT_A_DISTRIBUTOR", re: /\b(kein(?:en)?\s+(?:vertrieb|handel|verkauf)|nicht\s+im\s+vertrieb|not\s+a\s+(?:distributor|reseller|retailer)|no\s+wholesale)\b/i },
  { kind: "MANUFACTURER_ONLY", re: /\b(nur\s+hersteller|ausschliesslich\s+hersteller|manufacturer\s+only|we\s+do\s+not\s+sell\s+directly|kein\s+direktverkauf)\b/i },
  { kind: "SERVICE_ONLY", re: /\b(reine[rs]?\s+dienstleist\w*|service\s+only|nur\s+dienstleistung|wir\s+verkaufen\s+keine)\b/i },
  { kind: "PRIVATE_ONLY", re: /\b(nur\s+f[uü]r\s+privatkunden|private\s+customers\s+only|kein\s+verkauf\s+an\s+(?:gewerbe|h[aä]ndler))\b/i },
  { kind: "DISCONTINUED", re: /\b(nicht\s+mehr\s+(?:im\s+sortiment|erh[aä]ltlich|lieferbar)|no\s+longer\s+available|discontinued|ausgelaufen)\b/i },
];

/** Find contradicting statements in a snippet of page text. */
export function findNegativeSignals(text: string): NegativeSignal[] {
  const out: NegativeSignal[] = [];
  for (const { kind, re } of NEGATIVE_PATTERNS) {
    const m = text.match(re);
    if (m) out.push({ kind, evidence: m[0].replace(/\s+/g, " ").trim() });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product evidence
// ---------------------------------------------------------------------------

/**
 * How strong the case is that this firm actually SELLS the searched product.
 *
 * The level a piece of evidence reaches is decided by WHERE it was found and how
 * many INDEPENDENT things corroborate it — never by how many times a word
 * occurs. Counting occurrences rewards long pages, not real sellers.
 */
export enum ProductEvidenceLevel {
  /** Nothing meaningful found. */
  NONE = 0,
  /** The term appears in ordinary page text. Never enough on its own. */
  WEAK_TEXT = 1,
  /** The term appears in a real commercial context (a category word, a product
   *  group, a sector description) but not on a page that sells it. */
  CONTEXTUAL = 2,
  /** Found on the firm's OWN product or category page. */
  PRODUCT_PAGE = 3,
  /** Found in a catalogue, price list or downloadable product document. */
  CATALOG = 4,
  /** Several independent strong signals agree. */
  STRONG_COMMERCIAL = 5,
}

export type ProductTermTier = "strong" | "medium" | "generic";

/** One matched product term, with everything needed to explain and audit it. */
export type ProductHit = {
  term: string;
  tier: ProductTermTier;
  pageUrl: string;
  pageType: PageType;
  /** Surrounding text, for the "why" panel and for negative-signal scanning. */
  snippet?: string;
};

export type ProductEvidenceInput = {
  hits: ProductHit[];
  /** OSM tagged this outlet with a shop type specific to the product (e.g.
   *  `shop=lingerie` for lingerie). A real corroborating signal — but a
   *  CORROBORATING one: it can never carry a verdict alone. */
  osmSpecificShop?: boolean;
  /** The firm's own NAME carries a strong product term ("Anna Dessous"). */
  nameMatchesProduct?: boolean;
  /** Wikidata states the outlet's BRAND produces/sells this product. */
  brandFactsMatch?: boolean;
  /** Contradicting statements found near the matches. */
  negatives?: NegativeSignal[];
  /** Every page type the crawler actually fetched, including ones where nothing
   *  matched. Without this, "no product page in the hits" is ambiguous between
   *  "we read it and the product is absent" and "we never opened one". */
  crawledPageTypes?: PageType[];
};

export type ProductEvidenceResult = {
  level: ProductEvidenceLevel;
  fit: ProductFit;
  tier: "STRONG" | "MEDIUM" | "WEAK" | null;
  /** 0–100, how well-established the product claim is. Distinct from lead score. */
  confidence: number;
  /** Sourced, human-readable reasons — the "why" panel renders these verbatim. */
  reasons: string[];
  /** The hits that actually drove the verdict, for source attribution. */
  decisive: ProductHit[];
  negatives: NegativeSignal[];
};

const SELLING_PAGE_TYPES: PageType[] = ["PRODUCT", "CATALOG"];

/**
 * Decide what the site proved about the product.
 *
 * The rule this replaces was: one strong term, on any page that was not
 * boilerplate, sets VERIFIED. That single line produced the module's worst
 * false positives — a building-materials wholesaler VERIFIED for lingerie
 * because "Unterwäsche" appeared once in a workwear list, and every firm on the
 * planet VERIFIED for a one-word search.
 *
 * The rule now, in order:
 *   • A strong term in a CATALOGUE is the strongest single thing a free source
 *     can show us → CATALOG.
 *   • A strong term on the firm's own PRODUCT/CATEGORY page → PRODUCT_PAGE.
 *   • Either of those, corroborated by a second INDEPENDENT signal → STRONG_COMMERCIAL.
 *   • A strong term anywhere else, or a medium term on a selling page →
 *     CONTEXTUAL. This is the important demotion: a strong term on a homepage is
 *     a good sign, not proof, and it no longer verifies by itself.
 *   • CONTEXTUAL plus two independent corroborations is promoted to PRODUCT_PAGE,
 *     so a genuine small shop with `shop=lingerie`, "Dessous" in its name and
 *     "Dessous" on its homepage is not punished for having no /produkte path.
 *   • Anything weaker → WEAK_TEXT.
 *
 * Negative signals cap the outcome instead of subtracting from a score, because
 * "we are not a distributor" is not a smaller amount of evidence that they are.
 */
export function resolveProductEvidence(input: ProductEvidenceInput): ProductEvidenceResult {
  const negatives = input.negatives ?? [];
  const reasons: string[] = [];

  // Boilerplate pages carry no product weight at all. They are still crawled and
  // still mined for identity — that is precisely why they are fetched.
  const usable = input.hits.filter((h) => PAGE_TYPE_WEIGHT[h.pageType] >= 0.3);
  const strong = usable.filter((h) => h.tier === "strong");
  const medium = usable.filter((h) => h.tier === "medium");
  const generic = usable.filter((h) => h.tier === "generic");

  const strongOnSelling = strong.filter((h) => SELLING_PAGE_TYPES.includes(h.pageType));
  const strongOnCatalog = strong.filter((h) => h.pageType === "CATALOG");
  const mediumOnSelling = medium.filter((h) => SELLING_PAGE_TYPES.includes(h.pageType));
  // A category-level word on the HOMEPAGE is a real, if weak, commercial signal —
  // it is what a shop leads with. Dropping it to WEAK_TEXT (as a first cut of
  // this engine did) demoted genuine retailers like Loveco and FALKE to
  // "belirsiz" purely because the crawler had never opened a product page.
  const mediumOnPrimary = medium.filter((h) => PAGE_TYPE_WEIGHT[h.pageType] >= 0.6);

  // Did we ever actually READ a page where product proof would live? If not, the
  // absence of catalogue-grade evidence is OUR crawl gap, not a fact about the
  // firm — and the module's whole doctrine is that a gap is never a negative.
  // Measured on the live cache: of 1369 crawled pages only 14 were product or
  // catalogue pages, so without this the stricter ladder would have punished
  // almost every real retailer for a page nobody fetched.
  const crawledSellingPage = input.hits.some((h) => SELLING_PAGE_TYPES.includes(h.pageType))
    || (input.crawledPageTypes ?? []).some((t) => SELLING_PAGE_TYPES.includes(t));

  // INDEPENDENT corroborations — different kinds of evidence, not repetitions of
  // the same one. Two strong terms on one page is one signal, not two.
  const corroborations: string[] = [];
  if (input.osmSpecificShop) corroborations.push("OSM mağaza türü doğrudan bu ürüne özel");
  if (input.nameMatchesProduct) corroborations.push("Firma adı aranan ürünü içeriyor");
  if (input.brandFactsMatch) corroborations.push("Wikidata markayı bu ürüne bağlıyor");
  const distinctStrongTerms = new Set(strong.map((h) => h.term)).size;
  if (distinctStrongTerms >= 2) corroborations.push(`${distinctStrongTerms} farklı güçlü ürün terimi bulundu`);
  const distinctSellingPages = new Set(strong.concat(medium).filter((h) => SELLING_PAGE_TYPES.includes(h.pageType)).map((h) => h.pageUrl)).size;
  if (distinctSellingPages >= 2) corroborations.push(`${distinctSellingPages} ayrı ürün/katalog sayfasında bulundu`);

  let level: ProductEvidenceLevel;
  let decisive: ProductHit[] = [];

  if (strongOnCatalog.length > 0) {
    level = ProductEvidenceLevel.CATALOG;
    decisive = strongOnCatalog;
    reasons.push(`Katalog/doküman sayfasında güçlü ürün kanıtı: ${strongOnCatalog.map((h) => h.term).join(", ")}.`);
  } else if (strongOnSelling.length > 0) {
    level = ProductEvidenceLevel.PRODUCT_PAGE;
    decisive = strongOnSelling;
    reasons.push(`Ürün/kategori sayfasında güçlü ürün kanıtı: ${strongOnSelling.map((h) => h.term).join(", ")}.`);
  } else if (strong.length > 0 || mediumOnSelling.length > 0 || mediumOnPrimary.length > 0) {
    level = ProductEvidenceLevel.CONTEXTUAL;
    decisive = strong.length > 0 ? strong : mediumOnSelling.length > 0 ? mediumOnSelling : mediumOnPrimary;
    reasons.push(
      strong.length > 0
        ? `Ürün terimi bulundu ama ürün/katalog sayfasında değil (${decisive[0]!.pageType}): ${strong.map((h) => h.term).join(", ")}.`
        : `Kategori düzeyinde ürün sinyali (${decisive[0]!.pageType}): ${decisive.map((h) => h.term).join(", ")}.`,
    );
  } else if (medium.length > 0) {
    level = ProductEvidenceLevel.WEAK_TEXT;
    decisive = medium;
    reasons.push(`Yalnızca genel kategori terimi bulundu: ${medium.map((h) => h.term).join(", ")}.`);
  } else if (generic.length > 0) {
    level = ProductEvidenceLevel.WEAK_TEXT;
    decisive = generic;
    reasons.push("Yalnızca genel ürün/sektör terimleri bulundu.");
  } else {
    level = ProductEvidenceLevel.NONE;
    reasons.push("Taranan sayfalarda aranan ürünle ilgili terim bulunamadı.");
  }

  // Promotions. Independent agreement is what turns a good sign into a claim.
  if (level >= ProductEvidenceLevel.PRODUCT_PAGE && corroborations.length >= 1) {
    level = ProductEvidenceLevel.STRONG_COMMERCIAL;
    reasons.push(`Bağımsız doğrulama: ${corroborations.join("; ")}.`);
  } else if (level === ProductEvidenceLevel.CONTEXTUAL && corroborations.length >= (crawledSellingPage ? 2 : 1)) {
    // A real shop without a readable /produkte path still deserves a verdict.
    //
    // The bar depends on whether we LOOKED: when a selling page was crawled and
    // the product is not on it, that silence is evidence and two independent
    // corroborations are required to overrule it. When no selling page was ever
    // fetched, there is no silence to overrule — one corroboration is enough,
    // because otherwise the firm is being marked down for our crawl budget.
    level = ProductEvidenceLevel.PRODUCT_PAGE;
    reasons.push(
      crawledSellingPage
        ? `Ürün sayfasında bulunamadı ancak birbirinden bağımsız ${corroborations.length} sinyal aynı yöne işaret ediyor: ${corroborations.join("; ")}.`
        : `Ürün/katalog sayfası taranmadı; mevcut bağımsız sinyaller: ${corroborations.join("; ")}.`,
    );
  } else if (corroborations.length > 0) {
    reasons.push(`Destekleyici sinyal: ${corroborations.join("; ")}.`);
  }

  // Contradictions cap the claim.
  if (negatives.length > 0) {
    const hard = negatives.some((n) => n.kind === "NOT_A_DISTRIBUTOR" || n.kind === "SERVICE_ONLY" || n.kind === "DISCONTINUED");
    const capped = hard ? ProductEvidenceLevel.WEAK_TEXT : ProductEvidenceLevel.CONTEXTUAL;
    if (level > capped) {
      level = capped;
      reasons.push(`Sitede aksi yönde ifade bulundu, kanıt seviyesi düşürüldü: ${negatives.map((n) => `"${n.evidence}"`).join(", ")}.`);
    }
  }

  const fit: ProductFit =
    level >= ProductEvidenceLevel.PRODUCT_PAGE ? "VERIFIED"
      : level === ProductEvidenceLevel.CONTEXTUAL ? "LIKELY"
        : level === ProductEvidenceLevel.WEAK_TEXT ? "UNCLEAR"
          : "UNCLEAR";

  const tier: ProductEvidenceResult["tier"] =
    level >= ProductEvidenceLevel.PRODUCT_PAGE ? "STRONG"
      : level === ProductEvidenceLevel.CONTEXTUAL ? "MEDIUM"
        : level === ProductEvidenceLevel.NONE ? null : "WEAK";

  const CONFIDENCE_BY_LEVEL: Record<ProductEvidenceLevel, number> = {
    [ProductEvidenceLevel.NONE]: 0,
    [ProductEvidenceLevel.WEAK_TEXT]: 25,
    [ProductEvidenceLevel.CONTEXTUAL]: 55,
    [ProductEvidenceLevel.PRODUCT_PAGE]: 80,
    [ProductEvidenceLevel.CATALOG]: 88,
    [ProductEvidenceLevel.STRONG_COMMERCIAL]: 95,
  };

  return { level, fit, tier, confidence: CONFIDENCE_BY_LEVEL[level], reasons, decisive, negatives };
}

// ---------------------------------------------------------------------------
// Company type — a SEPARATE axis from product fit
// ---------------------------------------------------------------------------

/**
 * What kind of business this is, derived from commercial roles and site signals.
 *
 * Kept deliberately apart from product evidence, because conflating the two is
 * the module's other systemic false positive: OSM's `shop=trade` / `shop=wholesale`
 * says a firm sells in bulk and says NOTHING about what it sells. Live data:
 * 1522 of 3784 leads (40%) carry modelFit=VERIFIED almost entirely off that tag,
 * which fed a 100/100 commercialRole score to scrap-metal dealers in a
 * smart-glasses search.
 *
 * "This firm is a plausible commercial counterparty" and "this firm sells what
 * we are looking for" are two different claims and are now answered separately.
 */
export type CompanyType =
  | "MANUFACTURER" | "DISTRIBUTOR" | "IMPORTER" | "WHOLESALER"
  | "RETAILER" | "SERVICE" | "AGENCY" | "ASSOCIATION" | "UNKNOWN";

const ROLE_TO_TYPE: Array<{ role: string; type: CompanyType }> = [
  { role: "importer", type: "IMPORTER" },
  { role: "distributor", type: "DISTRIBUTOR" },
  { role: "wholesaler", type: "WHOLESALER" },
  { role: "sourcing", type: "DISTRIBUTOR" },
  { role: "manufacturer", type: "MANUFACTURER" },
  { role: "retail_chain", type: "RETAILER" },
  { role: "department_store", type: "RETAILER" },
  { role: "specialty_store", type: "RETAILER" },
  { role: "independent_store", type: "RETAILER" },
  { role: "boutique", type: "RETAILER" },
  { role: "retailer", type: "RETAILER" },
  { role: "ecommerce", type: "RETAILER" },
  { role: "marketplace_seller", type: "RETAILER" },
];

/**
 * Businesses that are structurally not buyers or sellers of goods.
 *
 * NO leading `\b`. German writes these as compounds — "Rechtsanwaltskanzlei",
 * "Bundesverband" — and a leading word boundary makes the pattern miss every
 * one of them, which is exactly what the benchmark caught: a law firm carrying
 * an OSM wholesale tag was still typed WHOLESALER. Same failure class as the
 * product-term boundary bug in Phase 1.
 *
 * Trailing `\w{0,3}(?!\w)` allows a German case ending ("Bundesverbandes")
 * while still refusing a longer unrelated stem — "Verbandsmaterial" (bandages,
 * a genuine medical-supply product) must NOT read as an association.
 */
const NON_TRADING_RE =
  /(rechtsanwalt|anwaltskanzl|kanzlei|law\s+firm|steuerberat|notariat|versicherungsmakl|insurance\s+broker|werbeagentur|marketing\s+agency|agentur\s+f[uü]r|verband\w{0,3}(?!\w)|verein\s+f[uü]r|\be\.\s?v\.|association|stiftung|foundation|universit[aä]t|hochschule|klinik|krankenhaus|hospital|arztpraxis|restaurant|gastst[aä]tte)/i;

export type CompanyTypeResult = { type: CompanyType; confidence: number; reasons: string[] };

export function resolveCompanyType(roles: string[], siteText?: string | null): CompanyTypeResult {
  const reasons: string[] = [];

  if (siteText && NON_TRADING_RE.test(siteText)) {
    const m = siteText.match(NON_TRADING_RE);
    reasons.push(`Site içeriği ticari mal alım-satımı dışında bir faaliyete işaret ediyor ("${m?.[0]}").`);
    // A law firm or an association is a real finding, not an unknown.
    return { type: /verband|verein|e\.\s?v\.|association|stiftung|foundation/i.test(m?.[0] ?? "") ? "ASSOCIATION" : "SERVICE", confidence: 70, reasons };
  }

  // Supplier-side roles outrank retail when a firm holds both — the stronger
  // commercial claim is the one worth reporting.
  for (const { role, type } of ROLE_TO_TYPE) {
    if (roles.includes(role)) {
      reasons.push(`Ticari rol: ${role}.`);
      return { type, confidence: 65, reasons };
    }
  }

  reasons.push("Şirket tipi belirlenemedi.");
  return { type: "UNKNOWN", confidence: 0, reasons };
}
