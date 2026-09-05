/**
 * AYZENITH LEAD FINDER — block-aware page text and legal-name extraction
 * (§ accuracy Phase 5).
 *
 * WHY THIS FILE EXISTS
 *
 * The website provider used to flatten a page by replacing every tag with a
 * single space and then look for "up to three words, then GmbH/AG/Inc." in the
 * resulting soup. Both halves of that were wrong, and the Phase 5 audit found
 * both of them in live data:
 *
 *  1. FLATTENING DESTROYS BOUNDARIES. A search-widget label and the company name
 *     in a completely different element become adjacent words, so a legal notice
 *     read as "Suchvorschläge Günter Tilly GmbH" (tilly-gmbh.de) and
 *     "Anschrift KüchenKonzepte Bartkowiak GmbH" (nobiliakuechen-berlin.de) —
 *     page furniture welded onto a real name. The previous answer was a growing
 *     list of banned leading words, which is a symptom filter: it can only ever
 *     know the labels somebody already hit.
 *
 *  2. A FIXED THREE-WORD WINDOW TRUNCATES REAL NAMES. Live captures:
 *     "Holz- und Baustoffhandel GmbH" — the real entity on kohbau.de's Impressum
 *     is "Kohbau Holz- und Baustoffhandel GmbH", so the brand itself was cut off
 *     and the lead then read as an impostor on its OWN site. Likewise
 *     "Dienstleistung und Verwaltung GmbH" (really WIEDEMANN Dienstleistung und
 *     Verwaltung GmbH) and "Shops PA Nord GmbH" (really Vodafone Shops PA Nord
 *     GmbH & Co. KG). A truncated name is worse than no name, because identity
 *     treats it as a checkable contradiction.
 *
 * The fix is structural, not lexical: keep the document's block boundaries when
 * stripping tags, and let a name reach only as far as its own block. Inside a
 * block the window is generous, because a block boundary is a real limit; only
 * when a block is long enough to be prose does the conservative old window come
 * back. No word list decides anything here.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

import {
  LEGAL_FORM_ONLY_RE,
  NAME_STOPWORDS_MULTILANG,
  normalizeForMatch,
} from "./providers/lang";
import { domainRelatesToName } from "./evidence";

// ---------------------------------------------------------------------------
// Block-aware text
// ---------------------------------------------------------------------------

/**
 * Tags that end a visual block, and therefore end a name.
 *
 * `br`, `li`, `td`, `label`, `option` and `summary` are in here for the same
 * reason as `p` and `div`: whatever sits on either side of them was never one
 * phrase on screen, so it must not become one phrase in our text. `span`, `a`,
 * `strong`, `em` and friends are NOT here — they routinely wrap part of a name
 * ("<strong>WIEDEMANN Dienstleistung und Verwaltung GmbH</strong>") and cutting
 * there would re-create the truncation this file exists to remove.
 */
const BLOCK_TAGS = [
  "address", "article", "aside", "blockquote", "br", "button", "caption", "dd",
  "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "label", "legend",
  "li", "main", "nav", "ol", "option", "p", "pre", "section", "summary", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
];

const BLOCK_TAG_RE = new RegExp(`</?(?:${BLOCK_TAGS.join("|")})(?:\\s[^>]*)?/?>`, "gi");

/** The handful of entities that actually change tokenisation. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
}

/**
 * Split a page into the text blocks a reader would see as separate lines.
 *
 * Block tags become hard separators; every other tag becomes a space, exactly as
 * before. The result is the same text the flat stripper produced, only with the
 * boundaries still in it.
 */
export function segmentHtml(html: string): string[] {
  const withBreaks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BLOCK_TAG_RE, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/** The flat text, identical in shape to what `stripTags` produced before. */
export function flattenSegments(segments: string[]): string {
  return segments.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Legal name
// ---------------------------------------------------------------------------

const NAME_STOPWORDS_BASE = [
  "berlin", "hamburg", "münchen", "munchen", "köln", "koln", "frankfurt", "stuttgart",
  "düsseldorf", "dusseldorf", "deutschland", "germany", "österreich", "osterreich",
  "schweiz", "straße", "strasse", "str", "platz", "weg", "allee", "gmbh", "kg", "ag",
  "geschäft", "geschaft", "handel", "vertrieb", "die", "der", "das", "und", "post",
  "email", "mail", "telefon", "kontakt", "impressum", "inhalte", "inhalt",
  "unser", "unsere", "für", "fur", "von", "bei", "mit", "im", "am", "zur", "zum",
  "startseite", "home", "über", "uber", "firma", "company",
];

export const NAME_STOPWORDS = new Set([...NAME_STOPWORDS_BASE, ...NAME_STOPWORDS_MULTILANG]);

const ORG_FORM_RE = /^(co|gmbh|ag|kg|ohg|ug|ek|ltd|inc|gbr|sarl|sas|sasu|eurl|srl|srls|spa|snc|sl|slu|sau|sa|bv|nv|vof|bvba|sprl|lda|oy|oyj|ab|as|aps|kft|zrt|sro|doo|plc|llc|sti)$/i;

/**
 * Leading page-furniture words, KEPT as a safety net but no longer load-bearing.
 *
 * Every entry here was added because flattening had welded a label onto a name.
 * Block segmentation now separates those at the source, so this list should fire
 * rarely; it stays because a site can still put a label and a name inside one
 * block, and removing a working guard to prove a point helps nobody. Nothing new
 * is added to it — the structural fix is the fix.
 */
const LEGAL_NAME_LEAK_WORDS = new Set([
  "about", "us", "contact", "privacy", "cookie", "cookies", "terms", "agb",
  "widerruf", "widerrufsbelehrung", "retouren", "retoure", "entsorgung",
  "versandarten", "versandkosten", "zahlarten", "zahlungsarten",
  "lieferung", "lieferzeit", "faq", "hilfe", "help", "suchvorschlage",
  "suchvorschläge", "erreichbarkeit",
  "anfahrt", "rechtliches", "sitemap", "menu", "navigation", "anzeigen",
  "deal", "sonderposten", "newsletter", "login", "registrieren", "warenkorb",
  "checkout", "bestellung", "datenschutzerklarung", "datenschutzerklärung",
  "webanalysedienst", "analysedienst", "cookiehinweis", "datenschutzhinweis",
  // NOT included, deliberately, despite looking like page-nav words: "versand"
  // and "dienstleistung(en)" — both are also genuine, common leading words in
  // real German legal-entity names ("Otto Versand GmbH", and the live case
  // "WIEDEMANN Dienstleistung und Verwaltung GmbH"). Ambiguous words are left
  // in, not out: failing to drop leaked text is recoverable downstream, while
  // destroying a real company name is not.
]);

const LEGAL_NAME_STOPWORDS = new Set([...NAME_STOPWORDS, ...LEGAL_NAME_LEAK_WORDS]);

/**
 * Well-known THIRD-PARTY organisations that appear in almost every site's own
 * privacy/cookie/analytics disclosure ("provided by Google Inc.") while never
 * being the searched firm's entity. Checked against what REMAINS after
 * stripping, so this only fires when the third party is the whole result.
 */
const THIRD_PARTY_ORG_NAMES = new Set([
  "google", "alphabet", "facebook", "meta", "youtube", "instagram", "twitter",
  "microsoft", "amazon", "dolby", "stripe", "paypal", "hotjar", "doubleclick",
  "cloudflare", "matomo", "hubspot", "mailchimp", "sentry", "wix", "shopify",
  "strato",
]);

/** Is this token a legal-entity suffix rather than part of the name? */
export function isOrgFormToken(token: string): boolean {
  return ORG_FORM_RE.test(token.replace(/[.,&]/g, ""));
}

/**
 * Trim a raw capture down to the name. Unchanged in behaviour from the previous
 * implementation — it still drops a leading year/©, a leading lowercase prose
 * word, a cross-sentence fragment and a bare third-party name — but it now
 * receives a candidate that never crossed a block boundary, so it has far less
 * to undo.
 */
/**
 * Articles and determiners. When one of these sits IMMEDIATELY before the legal
 * form, the form is a common noun, not the tail of a name.
 *
 * This is grammar, not a vocabulary of banned phrases. German legal pages are
 * full of lines that talk ABOUT the company — "Registergericht der GmbH:",
 * "Sitz der GmbH", "Geschäftsführer der AG", "les statuts de la SARL" — and the
 * form-matcher happily read the label in front as the name (live:
 * "Registergericht der GmbH" on nobiliakuechen-berlin.de, which then produced a
 * MISMATCH). No company on earth is registered as "<something> der GmbH": a
 * genuine name puts a NOUN there ("Kohbau Holz- und Baustoffhandel GmbH",
 * "WIEDEMANN Dienstleistung und Verwaltung GmbH"), never an article. One closed
 * grammatical class covers the whole family at once.
 */
const DETERMINERS_BEFORE_FORM = new Set([
  // de
  "der", "die", "das", "des", "dem", "den", "einer", "eines", "einem", "einen", "eine", "ein",
  "unserer", "unseres", "unserem", "ihrer", "ihres", "dieser", "diese", "dieses", "diesem",
  // en / fr / it / es / nl — same construction, same tell
  "the", "a", "an", "of", "de", "du", "la", "le", "les", "des", "del", "della", "dello",
  "el", "los", "las", "van", "het", "een",
  // Prepositions belong to the same closed class and fail the same way: no
  // registered name ends "<preposition> AG". Live: "Tel. Ladenatelier mit AB"
  // on traumkeramik-julion.de, where the Swedish form "AB" closed a German
  // sentence. "Bank für Sozialwirtschaft AG" is unaffected — the word before
  // its form is a noun, as it is in every genuine name.
  "mit", "durch", "bei", "in", "an", "auf", "aus", "nach", "vor", "über", "uber",
  "with", "by", "at", "for", "from", "par", "per", "con", "por",
]);

export function cleanLegalName(raw: string): string | null {
  let tokens = raw.trim().split(/\s+/);

  // "<label> der GmbH" is a sentence about a company, not a company.
  if (tokens.length >= 2) {
    const beforeForm = tokens[tokens.length - 2]!;
    if (isOrgFormToken(tokens[tokens.length - 1]!) &&
        DETERMINERS_BEFORE_FORM.has(normalizeForMatch(beforeForm))) {
      return null;
    }
  }

  const breakIdx = tokens.findIndex((t, i) => {
    if (i >= tokens.length - 1 || isOrgFormToken(t)) return false;
    const bare = t.replace(/[,&]/g, "");
    return /\.$/.test(bare) && bare.length > 5;
  });
  if (breakIdx >= 0) tokens = tokens.slice(breakIdx + 1);
  if (tokens.length === 0) return null;

  // Leading noise: a stopword, or a letterless token that is either pure
  // punctuation (a bullet, a dash) or carries a run of TWO OR MORE digits.
  //
  // The numeric half used to be a narrow `\d{2,4}` for the footer year. Live
  // captures showed the same junk-in-front shape in other clothing: a year RANGE
  // ("© 2005-2026 Marktplaats B.V.") and a phone number ("030/ 3996873 … AB" on
  // traumkeramik-julion.de). The two-digit-run condition is what keeps this from
  // eating real names — my own regression test caught "1&1 Telecom GmbH" being
  // reduced to "Telecom GmbH" when the rule was merely "no letters".
  while (
    tokens.length > 1 &&
    (LEGAL_NAME_STOPWORDS.has(normalizeForMatch(tokens[0]!)) ||
      (!/\p{L}/u.test(tokens[0]!) && (/\d{2,}/.test(tokens[0]!) || !/\d/.test(tokens[0]!))))
  ) {
    tokens.shift();
  }
  // A leaked prose word is lowercase while the name that follows is not. The
  // token must actually CONTAIN a lowercase letter: without that test a
  // letterless token trivially equals its own lowercase form and gets eaten —
  // found by regression test, "1&1 Telecom GmbH" was being cut to "Telecom GmbH".
  while (
    tokens.length > 1 &&
    /\p{Ll}/u.test(tokens[0]!) &&
    tokens[0]! === tokens[0]!.toLocaleLowerCase("de") &&
    tokens.slice(1).some((t) => !isOrgFormToken(t) && t !== t.toLocaleLowerCase("de"))
  ) {
    tokens.shift();
  }
  if (tokens.length < 2 && isOrgFormToken(tokens[0] ?? "")) return null;

  // Punctuation-only tokens are not a name either. Without this a capture of
  // pure legal forms survived on the strength of a lone ampersand — live:
  // "G.m.b.H. & Co. KG" on dunekacke.de, where "&" was the only token the
  // org-form test did not consume.
  const nonOrgTokens = tokens.filter((t) => !isOrgFormToken(t) && /[\p{L}\p{N}]/u.test(t));
  if (nonOrgTokens.length === 0 || nonOrgTokens.every((t) => /^\d+$/.test(t))) return null;

  // ANY of these tokens, not merely all of them (§ accuracy Phase 5).
  //
  // The "all" test was written for a capture that was already just "Google Inc.".
  // With block segmentation, a privacy policy's processor disclosure arrives as
  // its own tidy block and keeps one German word in front — live regressions from
  // the first cut of this change: "Mutterkonzerns Meta Platforms Inc." on
  // widda-berlin.de and "Buchungslösung der Calendly LLC" on viviry.de, both of
  // which sailed through "all" because of that one leading word. If a platform
  // from this list appears in the captured name at all, the capture is a
  // processor disclosure, not the firm. No new names were added to the list.
  const normNonOrg = nonOrgTokens.map((t) => normalizeForMatch(t.replace(/[.,]/g, "")));
  if (normNonOrg.some((t) => THIRD_PARTY_ORG_NAMES.has(t))) return null;

  return tokens.join(" ");
}

/**
 * A block can still carry a label and its value ("Anschrift: Foo GmbH",
 * "E-Mail: … | Firma: Bar AG"). Both separators are structural punctuation, not
 * vocabulary, so splitting on them costs nothing and removes the last common way
 * page furniture reaches a name.
 */
function labelledPieces(segment: string): string[] {
  return segment.split(/[:|•·»]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * How many words before the legal form may belong to the name when the block is
 * short. A registered German name of five words before "GmbH" is ordinary
 * ("Kohbau Holz- und Baustoffhandel GmbH" is four); beyond this the block is
 * prose and the conservative window applies instead.
 */
const BLOCK_NAME_MAX_TOKENS = 6;

/** The old flat-text window, used only when a block is too long to be a name. */
const PROSE_NAME_MAX_TOKENS = 3;

/**
 * Pull the registered name out of a page, one block at a time.
 *
 * A page can legitimately print SEVERAL entity names: the firm's own, plus every
 * data processor its privacy policy has to disclose. Taking the first one found
 * is a coin toss, and block segmentation made it a worse one — a processor block
 * is tidy and often comes early, so the first cut of this change replaced
 * "VIVIRY GmbH" with "Buchungslösung der Calendly LLC" on viviry.de.
 *
 * So every candidate on the page is collected and the one that RELATES TO THIS
 * DOMAIN wins. That is not a heuristic about wording; it is the same ownership
 * evidence identity already relies on — whose site is this. With no domain, or
 * when nothing relates, the first candidate is returned exactly as before, so no
 * page that used to yield a name now yields none.
 */
export function extractLegalName(
  segments: string[],
  domain?: string | null,
  /** Blocks that repeat across the whole site — see `repeatedSegments`. A cookie
   *  banner or a footer is on every page; a statutory Impressum body is on one. */
  siteWideBlocks?: Set<string> | null,
  /** When given, every candidate must pass `assessLegalName` with this page's
   *  provenance. Omitted by callers that only want the raw capture. */
  gate?: { fromLegalPage: boolean } | null,
): string | null {
  const candidates: Array<{ name: string; fromChrome: boolean; hasAddressNearby: boolean; blockIndex: number }> = [];

  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si]!;
    const fromChrome = siteWideBlocks?.has(segment.trim()) ?? false;
    // A disclosure prints the address with the name; a passing mention does not.
    // Window sized from real pages, not guessed: vooberlin.com prints
    // name / "represented by" / street / postcode+city, so the address sits THREE
    // blocks below the name. Five leaves room for a c/o or a second manager line.
    const hasAddressNearby = segments
      .slice(si, si + 6)
      .some((s) => looksLikePostalAddress(s));
    for (const piece of labelledPieces(segment)) {
      const m = piece.match(LEGAL_FORM_ONLY_RE);
      if (!m || m.index === undefined) continue;

      const before = piece.slice(0, m.index).trim();
      if (!before) continue; // a bare "GmbH" with nothing in front is not a name
      const beforeTokens = before.split(/\s+/);

      // A short block IS the name; a long one is prose, so fall back to the
      // narrow window rather than swallowing a sentence.
      const nameTokens =
        beforeTokens.length <= BLOCK_NAME_MAX_TOKENS
          ? beforeTokens
          : beforeTokens.slice(-PROSE_NAME_MAX_TOKENS);

      const cleaned = cleanLegalName(`${nameTokens.join(" ")} ${m[0]}`);
      if (cleaned && !candidates.some((c) => c.name === cleaned)) {
        candidates.push({ name: cleaned, fromChrome, hasAddressNearby, blockIndex: si });
      }
      if (candidates.length >= 12) break; // a legal page never needs more
    }
  }

  if (candidates.length === 0) return null;

  // NOTE: a separate array, never a mutation of `candidates`. Without a gate the
  // filter would alias the same array, and clearing it in place emptied the list
  // it was about to be repopulated from — my own bug, caught by these tests.
  const eligible = gate
    ? candidates.filter((c) =>
      assessLegalName(c.name, {
        domain,
        fromLegalPage: gate.fromLegalPage,
        hasAddressNearby: c.hasAddressNearby,
        blockIndex: c.blockIndex,
      }).accept)
    : candidates.slice();
  if (eligible.length === 0) return null;

  const relates = (c: { name: string }) => Boolean(domain) && domainRelatesToName(domain, c.name);

  // Preference order. Site-wide blocks are demoted, never banned: on a small site
  // the footer may be the ONLY place the entity is printed, and refusing it would
  // trade one wrong answer for no answer.
  //
  // This is what the cookie-banner leaks were: "Brevo GmbH" (widda-berlin.de),
  // "Pickware GmbH" (vooberlin.com) and "Buchungslösung der Calendly LLC"
  // (viviry.de) are consent/plugin vendors printed on EVERY page, while the real
  // Impressum body appears on exactly one. Nothing about their words gives them
  // away — their position does.
  const pick =
    eligible.find((c) => !c.fromChrome && relates(c)) ??
    eligible.find((c) => relates(c)) ??
    eligible.find((c) => !c.fromChrome) ??
    eligible[0]!;

  // NOTE (kept): an earlier revision also trimmed everything before the first token
  // that matched the domain, to turn "Vorstand der Aurubis AG" into "Aurubis AG".
  // The live replay showed what that costs: "Harry Lott Baustoffe GmbH" on
  // lott-baustoffe.de became "Lott Baustoffe GmbH", because "lott" matches the
  // domain and "Harry" precedes it. Losing a founder's first name is the exact
  // truncation this file exists to stop, and a cosmetically longer capture that
  // still CONTAINS the right tokens costs identity nothing — `compareNames` works
  // on token overlap. The trim was removed; the leading-prose case is left as it
  // is on purpose.
  return pick.name;
}

// ---------------------------------------------------------------------------
// Choosing between pages
// ---------------------------------------------------------------------------

export type LegalNameSource = {
  segments: string[];
  /** True for a STATUTORY legal notice (Impressum, legal-notice, mentions
   *  légales) — the page where the operator is required to name ITSELF. */
  isLegalPage: boolean;
};

/**
 * Pick the operator's registered name across every company-disclosure page we
 * read, instead of taking whichever page the crawler happened to reach first.
 *
 * THE BUG THIS CLOSES (§ accuracy Phase 5, second pass). Privacy pages were
 * consulted for a legal name with exactly the same priority as the statutory
 * legal notice. But those two pages are required to name DIFFERENT companies:
 * an Impressum names the operator, a privacy policy names every processor the
 * operator uses. Measured on the live cache, page by page:
 *
 *    viviry.de           /policies/legal-notice → VIVIRY GmbH
 *                        /policies/privacy-policy → "Buchungslösung der Calendly LLC"
 *    vooberlin.com       /policies/legal-notice → Müjdeci GmbH
 *                        /policies/privacy-policy → Pickware GmbH
 *    nobiliakuechen…     /service/impressum → KüchenKonzepte Bartkowiak GmbH
 *                        /service/datenschutz → Hetzner Online GmbH
 *
 * In every case the right answer was already on a page we had read. No list of
 * vendor names is needed — and could not have worked anyway, since the next site
 * uses a vendor nobody has written down yet.
 *
 * widda-berlin.de is the interesting one: its Impressum names a SOLE TRADER
 * ("WiDDA Inh.: Sabine Kelle"), which carries no legal form and so cannot be
 * captured at all, while its privacy page offers a perfectly well-formed
 * "Brevo GmbH". That is why rule 4 below is conditional: once we have READ the
 * statutory page and it named nobody, a foreign-looking name from a privacy page
 * is far more likely a processor than the operator, and `null` — "we could not
 * establish it" — is the honest answer.
 */
export function resolveLegalName(
  sources: LegalNameSource[],
  domain?: string | null,
  siteWideBlocks?: Set<string> | null,
): string | null {
  const legal = sources.filter((s) => s.isLegalPage);
  const other = sources.filter((s) => !s.isLegalPage);
  const readAStatutoryPage = legal.length > 0;

  const firstOf = (list: LegalNameSource[], requireOwn: boolean): string | null => {
    for (const s of list) {
      const name = extractLegalName(s.segments, domain, siteWideBlocks, {
        fromLegalPage: s.isLegalPage,
      });
      if (!name) continue;
      if (requireOwn && !(domain && domainRelatesToName(domain, name))) continue;
      return name;
    }
    return null;
  };

  return (
    // 1–2. The statutory page, preferring a name that also vouches for the domain.
    firstOf(legal, true) ??
    firstOf(legal, false) ??
    // 3. Elsewhere, but only a name that vouches for the domain.
    firstOf(other, true) ??
    // 4. Any other name at all — ONLY when no statutory page was ever read.
    (readAStatutoryPage ? null : firstOf(other, false))
  );
}

// ---------------------------------------------------------------------------
// What a re-check is allowed to write
// ---------------------------------------------------------------------------

/**
 * The value a re-verification should write to `LeadCompany.legalName`:
 * a string to set it, `null` to CLEAR it, `undefined` to leave it alone.
 *
 * Pure and exported so the rule is testable — `reverify.ts` cannot be imported
 * from tests (`server-only`). See the call site for why the three-way answer
 * matters: erasing on a site that simply failed to answer would destroy a good
 * name on a bad network day.
 */
export function legalNameWrite(outcome: {
  legalName: string | null | undefined;
  websiteStatus: string | null | undefined;
}): string | null | undefined {
  if (outcome.websiteStatus !== "ACTIVE") return undefined; // we could not ask
  return outcome.legalName ?? null; // we asked; this is the answer, empty or not
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

/** A postal address, in the shape every European disclosure law requires next
 *  to the entity name: a 4–6 digit postcode followed by a place, or a street
 *  line with a house number. Address grammar only — no company vocabulary. */
const POSTCODE_PLACE_RE = /\b\d{4,6}\s+\p{Lu}[\p{L}.'-]{2,}/u;
const STREET_LINE_RE =
  /[\p{L}.'-]{3,}\s?(?:stra(?:ß|ss)e|str\.|weg|allee|platz|gasse|ring|damm|ufer|chaussee|rue|via|calle|street|road|avenue|laan|straat)\s*\.?,?\s*\d/iu;

export function looksLikePostalAddress(text: string): boolean {
  return POSTCODE_PLACE_RE.test(text) || STREET_LINE_RE.test(text);
}

export type LegalNameContext = {
  /** The host we actually read. */
  domain?: string | null;
  /** The candidate came off a STATUTORY legal notice. */
  fromLegalPage: boolean;
  /** The candidate's own block, or one shortly after it, carries a postal
   *  address — the shape of a real disclosure rather than a passing mention. */
  hasAddressNearby: boolean;
  /** Which text block it came from. Block 0 is the page's own <title>. */
  blockIndex?: number;
};

/** A <title> is, by construction, about the page. On a company-disclosure page
 *  a company named there is that page's company. Measured on the live cache:
 *  bwzonline.de, abwshop.de, coledampfs.de and premium-fachhandel.de all print
 *  their entity ONLY in the title ("Impressum | BWZ Elektronik Vertrieb GmbH"),
 *  with no address block anywhere near it — while every provider leak sat deep
 *  in the body (Lian Li at block 93, Hasenecker at 873, DHL Paket at 1349). */
const TITLE_BLOCK_MAX_INDEX = 1;

export type LegalNameVerdict = { accept: boolean; reason: string };

/** A four-digit year, the signature of a copyright line. */
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
/** Four or more consecutive digits: a phone number, a register number, a
 *  postcode — never part of a trading name. ("1&1", "3M" are unaffected.) */
const LONG_DIGIT_RUN_RE = /\d{4,}/;

/**
 * Is this text plausibly a REGISTERED COMPANY NAME, and is it plausibly THIS
 * company's?
 *
 * Two layers, both general and both explainable in one line each. Nothing here
 * knows the name of a single vendor, hoster or product — a list of those could
 * only ever cover the sites somebody has already looked at, and the next site
 * uses a provider nobody has written down.
 *
 *  SHAPE (is this a name at all?)
 *    • a copyright mark or a year → a footer line, not a registered name
 *    • four or more consecutive digits → a phone/register/postcode fragment
 *    • nothing left but punctuation and legal forms → not a name
 *
 *  ATTRIBUTION (is it THIS firm's?)
 *    • a name that vouches for the domain is accepted outright
 *    • otherwise it must come off the statutory page AND sit next to a postal
 *      address — the shape the disclosure laws impose. A provider named in a
 *      shipping paragraph, a product in a carousel and a brand in a category
 *      list all fail this, without anyone having to enumerate them.
 *
 * Deliberately NOT rejected: an unfamiliar-looking name that is properly
 * disclosed. A brand trading under a different legal entity is the normal case
 * (Raab Karcher → STARK Deutschland GmbH), and treating it as junk would throw
 * away exactly the evidence identity needs.
 */
export function assessLegalName(name: string, ctx: LegalNameContext): LegalNameVerdict {
  const trimmed = name.trim();
  if (!trimmed) return { accept: false, reason: "Boş." };

  if (/©/u.test(trimmed)) {
    return { accept: false, reason: "Telif işareti içeriyor — altbilgi metni, tescilli unvan değil." };
  }
  if (YEAR_RE.test(trimmed)) {
    return { accept: false, reason: "Yıl içeriyor — telif/tarih satırı, tescilli unvan değil." };
  }
  if (LONG_DIGIT_RUN_RE.test(trimmed)) {
    return { accept: false, reason: "Uzun rakam dizisi içeriyor — telefon/sicil/posta kodu parçası." };
  }
  const words = trimmed.split(/\s+/).filter((t) => !isOrgFormToken(t) && /\p{L}{2,}/u.test(t));
  if (words.length === 0) {
    return { accept: false, reason: "Hukuki form ve noktalama dışında bir ad kalmıyor." };
  }

  if (ctx.domain && domainRelatesToName(ctx.domain, trimmed)) {
    return { accept: true, reason: "Unvan, sitenin alan adıyla bağdaşıyor." };
  }
  if (ctx.fromLegalPage && ctx.hasAddressNearby) {
    return { accept: true, reason: "Yasal bildirim sayfasında, posta adresiyle birlikte açıklanmış." };
  }
  if ((ctx.blockIndex ?? Infinity) <= TITLE_BLOCK_MAX_INDEX) {
    return { accept: true, reason: "Sayfanın kendi başlığında geçiyor — bu sayfanın ait olduğu şirket." };
  }
  return {
    accept: false,
    reason: ctx.fromLegalPage
      ? "Yasal bildirim sayfasında ama adres bloğunun içinde değil — sayfada anılan başka bir şirket olabilir."
      : "Yasal bildirim sayfasında değil ve alan adı bu unvanı doğrulamıyor.",
  };
}
