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

const ORG_FORM_RE = /^(gmbh|ag|kg|ohg|ug|ek|ltd|inc|gbr|sarl|sas|sasu|eurl|srl|srls|spa|snc|sl|slu|sau|sa|bv|nv|vof|bvba|sprl|lda|oy|oyj|ab|as|aps|kft|zrt|sro|doo|plc|llc|sti)$/i;

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
export function cleanLegalName(raw: string): string | null {
  let tokens = raw.trim().split(/\s+/);

  const breakIdx = tokens.findIndex((t, i) => {
    if (i >= tokens.length - 1 || isOrgFormToken(t)) return false;
    const bare = t.replace(/[,&]/g, "");
    return /\.$/.test(bare) && bare.length > 5;
  });
  if (breakIdx >= 0) tokens = tokens.slice(breakIdx + 1);
  if (tokens.length === 0) return null;

  while (
    tokens.length > 1 &&
    (LEGAL_NAME_STOPWORDS.has(normalizeForMatch(tokens[0]!)) || /^(?:[©®]|\d{2,4}|[©®]\d{2,4})$/.test(tokens[0]!))
  ) {
    tokens.shift();
  }
  while (
    tokens.length > 1 &&
    tokens[0]! === tokens[0]!.toLocaleLowerCase("de") &&
    tokens.slice(1).some((t) => !isOrgFormToken(t) && t !== t.toLocaleLowerCase("de"))
  ) {
    tokens.shift();
  }
  if (tokens.length < 2 && isOrgFormToken(tokens[0] ?? "")) return null;

  const nonOrgTokens = tokens.filter((t) => !isOrgFormToken(t));
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
): string | null {
  const candidates: Array<{ name: string; fromChrome: boolean }> = [];

  for (const segment of segments) {
    const fromChrome = siteWideBlocks?.has(segment.trim()) ?? false;
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
        candidates.push({ name: cleaned, fromChrome });
      }
      if (candidates.length >= 12) break; // a legal page never needs more
    }
  }

  if (candidates.length === 0) return null;

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
    candidates.find((c) => !c.fromChrome && relates(c)) ??
    candidates.find((c) => relates(c)) ??
    candidates.find((c) => !c.fromChrome) ??
    candidates[0]!;

  // NOTE: an earlier revision also trimmed everything before the first token
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
