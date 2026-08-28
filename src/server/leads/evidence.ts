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

import { normalizeProduct, CONFIDENCE_MODEL } from "@/config/leads";

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
 * Are two words one typo apart? (Levenshtein ≤ 1, computed without building a
 * matrix — we only ever need to know "at most one edit".)
 *
 * Used to stop a spelling variant from being reported as a contradiction. Live
 * case: a lead recorded as "Kobau" whose own Impressum reads "Kohbau Holz- und
 * Baustoffhandel GmbH" — one letter — was ruled a MISMATCH and had its whole
 * confidence capped at 10, on the strength of a difference that is almost
 * certainly a data-entry variant. One character is not proof of a different
 * company; it is proof that we cannot tell.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

/** A near-miss is only credible on words long enough for one edit to be a typo
 *  rather than a different word — "koh"/"kob" says nothing, "kohbau"/"kobau" does. */
const NEAR_MISS_MIN_LENGTH = 5;

function hasNearMiss(a: string[], b: string[]): boolean {
  return a.some((t) =>
    t.length >= NEAR_MISS_MIN_LENGTH &&
    b.some((u) => u.length >= NEAR_MISS_MIN_LENGTH && withinOneEdit(t, u)));
}

/**
 * Can this single word be built by running together the OPENINGS of the other
 * name's words, in order?
 *
 * Trading names are routinely blends of the founders' surnames: the live case is
 * "DEWEtech" on deinzer-weyland.de, whose Impressum reads "DEINZER + WEYLAND
 * GmbH" — DE(inzer) + WE(yland) + a trade suffix. Token overlap sees nothing in
 * common and reports a contradiction, so a firm was ruled an impostor on its own
 * site.
 *
 * The bar is deliberately high, because a loose version of this would excuse real
 * mismatches: at least TWO of the other name's words must be consumed, each by a
 * prefix of at least two characters, starting at the very beginning of the word,
 * and the consumed part must be a PREFIX of the word under test. Checked both
 * ways round. It never produces a positive verdict — only "inconclusive".
 */
const BLEND_MIN_PREFIX = 2;
const BLEND_MIN_TOKENS = 2;

function isInitialBlend(word: string, parts: string[]): boolean {
  if (word.length < 4 || parts.length < BLEND_MIN_TOKENS) return false;
  let pos = 0;
  let consumed = 0;
  for (const part of parts) {
    if (pos >= word.length) break;
    let take = 0;
    while (
      take < part.length &&
      pos + take < word.length &&
      part[take] === word[pos + take]
    ) take++;
    if (take < BLEND_MIN_PREFIX) continue; // this word of the name is skipped
    pos += take;
    consumed++;
  }
  return consumed >= BLEND_MIN_TOKENS && pos >= BLEND_MIN_PREFIX * BLEND_MIN_TOKENS;
}

function hasBlendRelation(a: string[], b: string[]): boolean {
  if (a.length === 1 && b.length >= BLEND_MIN_TOKENS && isInitialBlend(a[0]!, b)) return true;
  if (b.length === 1 && a.length >= BLEND_MIN_TOKENS && isInitialBlend(b[0]!, a)) return true;
  return false;
}

/**
 * Compare the name we believe a record is about against a name found on its
 * (supposed) own website.
 *
 * Token overlap is the primary test. The fallback matters as much: when either
 * side has no significant tokens at all — two-letter brands, "C&A" normalising to
 * the useless ["c","a"] — the comparison switches to the compact form so a real
 * disagreement is still detectable. And a NEAR-MISS on either path returns
 * "inconclusive": one edit is not a contradiction. Comparison stays
 * NEGATIVE-ONLY in spirit: it is used to doubt an attribution, never to
 * manufacture a positive one on its own.
 */
export function compareNames(candidateName: string, otherName: string): NameComparison {
  const a = significantTokens(foldGerman(normalizeProduct(candidateName)));
  const b = significantTokens(foldGerman(normalizeProduct(otherName)));
  if (a.length > 0 && b.length > 0) {
    const overlap = a.some((t) => b.some((u) => u.includes(t) || t.includes(u)));
    if (overlap) return "match";
    // Not a match — but neither a typo nor an acronym of the other name is a
    // disagreement. Returning "inconclusive" here is what turns a false MISMATCH
    // into an honest "could not verify", the whole doctrine of this module.
    return hasNearMiss(a, b) || hasBlendRelation(a, b) ? "inconclusive" : "mismatch";
  }

  // At least one side is all-short-tokens (a brand like C&A, H&M, S.Oliver).
  const ca = foldGerman(compactName(candidateName));
  const cb = foldGerman(compactName(otherName));
  if (ca.length < 2 || cb.length < 2) return "inconclusive";
  // "C&A" → "ca" inside "C&A Mode GmbH & Co. KG" → "camodegmbhcokg" ✓
  // "C&A" → "ca" against "Cunda Handels" → "cundahandels" ✗ (the real bug)
  if (cb.startsWith(ca) || ca.startsWith(cb) || cb.includes(ca) || ca.includes(cb)) return "match";
  return hasNearMiss([ca], [cb]) ? "inconclusive" : "mismatch";
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

  const allTokens = significantTokens(foldGerman(normalizeProduct(candidateName)));

  // A token of four characters or more may appear ANYWHERE inside a label:
  // "loveco" inside "loveco-shop", "falke" inside "falke". Substring freedom is
  // safe at this length.
  const tokens = allTokens.filter((t) => t.length >= 4);
  if (labels.some((core) => tokens.some((t) => core.includes(t)))) return true;

  // A SHORT token (2–3 characters) must EQUAL a label outright.
  //
  // Short tokens used to be dropped entirely, which silently threw away the one
  // piece of ownership evidence a short-branded firm has. Live: "AMR
  // Dachbaustoffe" on amr-shop.de — the label list already contains "amr" as a
  // hyphen part — came back UNVERIFIED on its own website, because "amr" was
  // filtered out before the comparison ever ran (12 rows).
  //
  // Equality, not containment, is what makes this safe, and it is the same rule
  // the compact form below has always used for names like C&A: "ca" still fails
  // against "carl-anderson" because no label EQUALS "ca". This strictly ADDS a
  // way to prove ownership; it removes none, so no previously-flagged domain
  // becomes acceptable through this branch.
  const shortTokens = allTokens.filter((t) => t.length >= 2 && t.length < 4);
  if (labels.some((core) => shortTokens.some((t) => core === t))) return true;

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

    // NO DOMAIN AT ALL → we never had site-ownership evidence to contradict, so
    // there is nothing to disagree WITH (§ accuracy Phase 5).
    //
    // MISMATCH is the harshest verdict this module can reach: it caps overall
    // confidence at 30 and drags product fit down with it. Reaching it required
    // only that a name on some page differed from ours — and with no domain, a
    // differing name is the ordinary case for a brand whose parent company owns
    // the site. Live: "Intimissimi" against "Calzedonia S.p.A", which is
    // genuinely its parent group, was ruled an impostor. Absence of evidence is
    // not evidence: this is UNVERIFIED, and it says so.
    if (!input.domain) {
      reasons.push(
        `Sitede okunan yasal unvan ("${other}") aranan firma adından farklı; ancak bu firmaya ait doğrulanmış bir alan adı yok, dolayısıyla sitenin sahipliği hakkında bir çelişki saptanamadı (marka/ana şirket ilişkisi de olabilir).`,
      );
      return { status: "UNVERIFIED", confidence: 20, reasons };
    }

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
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep the raw string — classification is best-effort, never fatal */
  }

  // A ROOT path is the homepage however the host happens to be written. The
  // previous exact-string compare against `baseUrl` broke on any www / protocol
  // difference — measured while building the Phase 3 baseline, 419 real cached
  // homepages classified as OTHER because the cache stored `https://www.x.de`
  // while the base was `https://x.de`.
  if (path === "/" || path === "") return "HOMEPAGE";
  if (url.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) return "HOMEPAGE";

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
  /** The term was found inside a text block that repeats across the site — a
   *  header, a mega-menu, a footer. Such a hit is real (the words ARE on the
   *  page) but it is ONE piece of evidence reprinted N times, never N
   *  independent ones. See `repeatedSegments`. */
  boilerplate?: boolean;
};

/**
 * Which text blocks are site-wide furniture rather than page content.
 *
 * Live case that forced this (§ accuracy Phase 5): daemmisol.de, a
 * building-materials dealer, came back as a strong match for a women's-underwear
 * search. The audit dumped the cache and found "Unterwäsche" — a workwear
 * category in the shop's mega-menu — on 9 of 9 crawled pages, in a byte-identical
 * 300-character context every time. The evidence engine read that as the product
 * appearing all over the site and counted the page variety as corroboration. It
 * is the opposite: one menu, printed nine times.
 *
 * The test is structural and needs no vocabulary — a block that appears verbatim
 * on most of the pages we read is chrome, whatever it says. Two thresholds have
 * to hold at once so a small crawl can never trip it: the block must repeat on at
 * least `minPages` pages AND on at least 60% of them. With the 4-page budget that
 * means 3 of 4; with 2 pages nothing is ever classified, which is correct — with
 * two samples we genuinely cannot tell a menu from a coincidence.
 */
export function repeatedSegments(pages: string[][], minPages = 3): Set<string> {
  const out = new Set<string>();
  if (pages.length < minPages) return out;
  const seen = new Map<string, number>();
  for (const segments of pages) {
    // Per PAGE, not per occurrence: a block repeated twice on one page is still
    // one page's worth of evidence.
    for (const s of new Set(segments)) {
      const key = s.trim();
      if (key.length === 0) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(minPages, Math.ceil(pages.length * 0.6));
  for (const [seg, n] of seen) if (n >= threshold) out.add(seg);
  return out;
}

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
  const onUsablePage = input.hits.filter((h) => PAGE_TYPE_WEIGHT[h.pageType] >= 0.3);

  // Site-wide chrome is separated out, NOT discarded (§ accuracy Phase 5). The
  // words really are on the page, so silently dropping them would be the same
  // "absence of evidence as evidence" mistake in the other direction; they are
  // simply not allowed to carry a verdict or to corroborate anything, because a
  // menu reprinted on every page is one signal, not many.
  const chromeAll = onUsablePage.filter((h) => h.boilerplate === true);
  const usable = onUsablePage.filter((h) => h.boilerplate !== true);

  // ONE menu is ONE signal, however many pages reprint it: dedupe by term before
  // anything counts it. This is the precise thing that was wrong — nine copies
  // of a nav entry looked like the product turning up all over the site.
  const chrome = [...new Map(chromeAll.map((h) => [h.term, h])).values()];
  const chromeStrong = chrome.filter((h) => h.tier === "strong");
  const chromeMedium = chrome.filter((h) => h.tier === "medium");
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
  } else if (chromeStrong.length > 0 || chromeMedium.length > 0) {
    // A product term in the site-wide menu, and nowhere in any page's own copy.
    //
    // This is real, if weak, commercial evidence and it is treated exactly like a
    // strong term on a homepage: CONTEXTUAL. It is NOT dismissed — for a clothing
    // retailer the mega-menu is where the actual categories live, and the first
    // cut of this rule capped chrome at WEAK_TEXT, which demoted Loveco, FALKE and
    // KiK (genuine textile firms, correctly found) to "belirsiz". That is the
    // false negative this doctrine exists to prevent.
    //
    // What chrome may never do is CLIMB: it cannot prove a product page and it
    // cannot corroborate anything (see `contextualFromChromeOnly` below), so a
    // building-materials dealer whose menu happens to list workwear underwear
    // can never be VERIFIED off that alone.
    //
    // Medium (category-level) chrome counts here for the same reason a medium
    // term on the HOMEPAGE does: the mega-menu IS the homepage's category list.
    // Excluding it demoted Loveco, FALKE and KiK — measured on live data — and
    // no amount of text analysis can separate a lingerie shop's "Unterwäsche"
    // menu entry from a builders' merchant's workwear one. That distinction
    // belongs to the company-type axis, not to product evidence, and inventing a
    // word rule to fake it would be exactly the symptom-suppression this phase
    // was told to avoid.
    level = ProductEvidenceLevel.CONTEXTUAL;
    decisive = chromeStrong.length > 0 ? chromeStrong : chromeMedium;
    reasons.push(
      `Ürün terimi yalnızca sitenin her sayfasında tekrar eden menü/başlık/altbilgi metninde bulundu (${decisive.map((h) => h.term).join(", ")}) — gerçek bir sinyal, ancak sayfaya özgü kanıt değil ve tekrarı bağımsız doğrulama sayılmadı.`,
    );
  } else if (medium.length > 0) {
    level = ProductEvidenceLevel.WEAK_TEXT;
    decisive = medium;
    reasons.push(
      medium.length > 0
        ? `Yalnızca genel kategori terimi bulundu: ${medium.map((h) => h.term).join(", ")}.`
        : `Yalnızca site geneli menü/altbilgi metninde genel kategori terimi bulundu: ${chromeMedium.map((h) => h.term).join(", ")}.`,
    );
  } else if (generic.length > 0) {
    level = ProductEvidenceLevel.WEAK_TEXT;
    decisive = generic;
    reasons.push("Yalnızca genel ürün/sektör terimleri bulundu.");
  } else {
    level = ProductEvidenceLevel.NONE;
    reasons.push("Taranan sayfalarda aranan ürünle ilgili terim bulunamadı.");
  }

  if (chrome.length > 0 && level > ProductEvidenceLevel.WEAK_TEXT) {
    reasons.push(
      `Ayrıca site geneli menü/altbilgi metninde de geçiyor (${[...new Set(chrome.map((h) => h.term))].join(", ")}) — bu tekrar bağımsız kanıt sayılmadı.`,
    );
  }

  // Promotions. Independent agreement is what turns a good sign into a claim.
  if (level >= ProductEvidenceLevel.PRODUCT_PAGE && corroborations.length >= 1) {
    level = ProductEvidenceLevel.STRONG_COMMERCIAL;
    reasons.push(`Bağımsız doğrulama: ${corroborations.join("; ")}.`);
  } else if (
    level === ProductEvidenceLevel.CONTEXTUAL &&
    // A CONTEXTUAL that rests ONLY on the site-wide menu must not be promoted to
    // a product-page claim, whatever else agrees with it. Repetition of one menu
    // is not the "independent agreement" this promotion is for.
    !(strong.length === 0 && mediumOnSelling.length === 0 && mediumOnPrimary.length === 0) &&
    corroborations.length >= (crawledSellingPage ? 2 : 1)
  ) {
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

// ---------------------------------------------------------------------------
// Evidence coverage
// ---------------------------------------------------------------------------

/**
 * Which sources the pipeline consulted for one company, and what happened.
 *
 * The four buckets are deliberately distinct, because collapsing them is how a
 * system starts lying about what it knows:
 *
 *  • `available` — consulted AND it answered. Real knowledge.
 *  • `failed`    — consulted and it did NOT answer (timeout, 5xx, blocked). We
 *                  tried and came back empty-handed; a retry might succeed.
 *  • `missing`   — not applicable to this firm at all. A company with no website
 *                  has no website sources to fail at. Nothing was lost here and
 *                  nothing can be retried.
 *  • `consulted` — everything we actually reached for (available ∪ failed).
 *
 * `missing` and `failed` must never be merged: one is a property of the firm,
 * the other a property of our run. Reporting a firm with no website as "5
 * sources failed" would invent a problem, and reporting a timed-out crawl as
 * "not applicable" would hide one.
 */
export type EvidenceCoverage = {
  consulted: string[];
  available: string[];
  failed: string[];
  missing: string[];
};

export function emptyCoverage(): EvidenceCoverage {
  return { consulted: [], available: [], failed: [], missing: [] };
}

/** Coverage as a 0–1 input to the confidence model: how much of what a fully
 *  reachable firm could tell us did we actually get. */
export function coverageRatio(c: EvidenceCoverage): number {
  return Math.min(1, c.available.length / CONFIDENCE_MODEL.maxChecks);
}

// ---------------------------------------------------------------------------
// Overall confidence — MODEL C
// ---------------------------------------------------------------------------

export type ConfidenceInput = {
  /** 0–100. Null when no site was read, so identity was never asked. */
  identity: number | null;
  /** 0–100. Null when no product evidence was gathered — NOT zero. */
  product: number | null;
  /** 0–1. */
  coverage: number;
  /** 0–1. */
  freshness: number;
  /** Caps the result when the site belongs to a different company. */
  identityStatus?: IdentityStatus | null;
};

export type ConfidenceResult = {
  /** 0–100, or null when neither core dimension was measured. */
  overall: number | null;
  /** The core before the reliability multipliers, for explainability. */
  core: number | null;
  /** Which dimensions actually took part. */
  measured: string[];
  reasons: string[];
};

/**
 * Combine the four dimensions into one number — see `CONFIDENCE_MODEL` for the
 * formula, the coefficients and why this shape beat the alternatives on real
 * data. Every constant lives there; none is written inline here.
 */
export function resolveConfidence(input: ConfidenceInput): ConfidenceResult {
  const M = CONFIDENCE_MODEL;
  const reasons: string[] = [];
  const measured: string[] = [];

  const i = input.identity;
  const p = input.product;
  if (i !== null) measured.push("identity");
  if (p !== null) measured.push("product");

  // Neither core dimension measured → we have nothing to be confident ABOUT.
  // Null, not zero: "we did not look" is not "we looked and found nothing".
  if (i === null && p === null) {
    reasons.push("Kimlik ve ürün kanıtının ikisi de ölçülmedi — güven hesaplanamıyor.");
    return { overall: null, core: null, measured, reasons };
  }

  const core =
    i === null ? p! :
      p === null ? i :
        M.coreWeakestWeight * Math.min(i, p) + M.coreMeanWeight * ((i + p) / 2);

  if (i !== null && p !== null) {
    reasons.push(`Çekirdek güven ${Math.round(core)} (kimlik ${i}, ürün ${p} — zayıf olan ağırlıklı).`);
  } else {
    reasons.push(`Çekirdek güven ${Math.round(core)} (yalnızca ${i === null ? "ürün" : "kimlik"} ölçülebildi).`);
  }

  const cov = Math.max(0, Math.min(1, input.coverage));
  const fr = Math.max(0, Math.min(1, input.freshness));
  const covMult = M.coverageFloor + (1 - M.coverageFloor) * cov;
  const frMult = M.freshnessFloor + (1 - M.freshnessFloor) * fr;
  measured.push("coverage", "freshness");

  if (cov < 1) reasons.push(`Kaynak kapsamı %${Math.round(cov * 100)} — güven en fazla %${Math.round((1 - M.coverageFloor) * 100)} oranında düşürüldü (az veri, yanlış veri demek değildir).`);
  if (fr < 1) reasons.push(`Kanıt tazeliği %${Math.round(fr * 100)} — güven en fazla %${Math.round((1 - M.freshnessFloor) * 100)} oranında düşürüldü.`);

  let overall = Math.round(core * covMult * frMult);

  // A site positively attributed to a DIFFERENT company cannot produce a
  // confident claim about this one, whatever else was found on it.
  if (input.identityStatus === "MISMATCH" && overall > M.mismatchCeiling) {
    overall = M.mismatchCeiling;
    reasons.push(`Kimlik uyuşmazlığı nedeniyle güven %${M.mismatchCeiling} ile sınırlandı — site başka bir işletmeye ait görünüyor.`);
  }

  return { overall: Math.max(0, Math.min(100, overall)), core: Math.round(core), measured, reasons };
}
