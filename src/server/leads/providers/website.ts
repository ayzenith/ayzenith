import "server-only";

import { cachedLeadFetch } from "../cache";
import { SOCIAL_PLATFORMS } from "@/config/leads";
import {
  langForSite,
  subpageRounds,
  normalizeForMatch,
  includesTermBoundary,
  LEGAL_PAGE_RE,
  COMPANY_INFO_PAGE_RE,
  foldAccents,
  HIGH_VALUE_PATH_RE,
  LOW_VALUE_PATH_RE,
  ROLE_TERMS_MULTILANG,
  B2B_TERMS_MULTILANG,
  B2C_TERMS_MULTILANG,
  DM_ROLE_PATTERNS_MULTILANG,
  NAME_TITLE_MULTILANG_RE,
  NAME_STOPWORDS_MULTILANG,
  PERSON_NAME_RE,
  LEGAL_FORM_RE,
  STORE_TERMS_MULTILANG,
  EMPLOYEE_TERMS_MULTILANG,
} from "./lang";

/**
 * AYZENITH LEAD FINDER — website intelligence provider (V2, free).
 *
 * Fetches a company's OWN public pages (homepage + a few high-signal pages like
 * the German legal Impressum, contact, about) and extracts ONLY what is actually
 * written there — never guessed:
 *
 *  • reachability (is the site live?)
 *  • product/category evidence (do our product terms appear?)
 *  • commercial-role signals (Großhandel/Vertrieb/Hersteller/Onlineshop…)
 *  • business model signals (B2B / B2C / both)
 *  • contact info literally present (mailto:/tel:, Impressum)
 *  • decision-maker names + roles literally present (Geschäftsführer, Inhaber…)
 *  • scale signals only if the site states them ("12 Filialen", "50 Mitarbeiter")
 *
 * Honesty rules baked in: an unreachable site is "UNREACHABLE", never "inactive";
 * an email is only returned if it appears verbatim on a page (NO firstname.lastname
 * pattern invention, §6); everything travels with the page URL it came from.
 * Politeness: at most a handful of same-site pages, short timeout, all cached.
 */

export type DecisionMaker = {
  firstName?: string;
  lastName?: string;
  role: string; // the role literally found (e.g. "Geschäftsführer")
  sourceUrl: string;
  /** 0–100 deterministic confidence in this being a real, current contact. */
  confidence: number;
  email?: string; // only if literally on the page and plausibly this person's
};

export type SocialLink = { platform: string; url: string };

export type SiteIntel = {
  status: "ACTIVE" | "UNREACHABLE";
  finalUrl: string;
  pagesFetched: string[];
  emails: string[];
  phones: string[];
  legalName?: string;
  /** The homepage's own <title>. Weakest of the identity signals — it is
   *  marketing copy, not a disclosure — but on a site whose legal page names
   *  nobody it is often the ONLY place the firm states who it is, so identity
   *  uses it to reach "partial" (never to declare a mismatch). */
  title?: string;
  /** EU VAT id printed on a legal page, unvalidated (§V3.7). */
  vatId?: string;
  /** Which of the supplied product terms appeared on the site. */
  productTermsFound: string[];
  /** Tiered product evidence (§2): STRONG/MEDIUM terms actually found on site. */
  strongFound: string[];
  mediumFound: string[];
  /** Whether an explicit non-relevant signal dominated (different industry). */
  roleSignals: string[]; // mapped LeadRole keys evidenced on the site
  modelSignals: { b2b: boolean; b2c: boolean };
  storeCount?: number;
  employeeCount?: number;
  decisionMakers: DecisionMaker[];
  /** Social profile links found on the company's OWN pages (§15 — verified by
   *  link-on-own-site ownership). Platform-internal metrics are NOT read. */
  socials: SocialLink[];
};

/** Product-fit signal tiers passed in from the resolved profile (§2). */
export type ProductSignals = { strong: string[]; medium: string[] };

/** Page context classification for product/model signal weighting (§V3.1).
 *  HIGH-VALUE pages (product/shop pages) → signals weighted fully.
 *  LOW-VALUE pages (career/corporate/news) → signals weighted down (not product evidence).
 *  Both path vocabularies are multi-language (§V3.9) — a French /carrieres page is
 *  as poor a source of product evidence as a German /karriere one. */
function pageContext(url: string): "HIGH_VALUE" | "LOW_VALUE" | "NORMAL" {
  const path = normalizeForMatch(url);
  if (HIGH_VALUE_PATH_RE.test(path)) return "HIGH_VALUE";
  if (LOW_VALUE_PATH_RE.test(path)) return "LOW_VALUE";
  return "NORMAL";
}

/** Role keywords → LeadRole. Multi-language (DE/EN). Case-insensitive on a
 *  normalised page text. A firm can trip several — all are kept (§3).
 *
 *  Entries may be a plain string (substring match — deliberate, so German
 *  compounds like "Elektrogroßhandel" still trip "großhandel") or a RegExp for
 *  the few terms whose substring form produces false positives (§V3.2):
 *  "import" matches "important", "sourcing" matches "outsourcing". Those two
 *  alone were enough to stamp a plain B2C retailer as İthalatçı/Tedarik. */
const ROLE_KEYWORDS_BASE: Array<{ role: string; terms: Array<string | RegExp> }> = [
  { role: "wholesaler", terms: ["großhandel", "grosshandel", "wholesale", "b2b-großhandel", "wiederverkäufer", "wiederverkaufer"] },
  // "vertrieb" alone is intentionally NOT here: it means "sales/distribution dept"
  // and appears on ordinary retailer sites, falsely tagging them distributors.
  // Only the unambiguous B2B forms remain (§3/§8).
  { role: "distributor", terms: ["distribution", "distributor", "vertriebspartner", "fachdistribution", "distribütör"] },
  // "import" must not fire on "important"/"importance"/"importantes" — the single
  // greediest false positive in the whole role map (§V3.2). The guard is now
  // "importan", which additionally blocks the Italian and Spanish false friends
  // "importanza"/"importancia" while still admitting importateur / importatore /
  // importador / importazione / importación (§V3.9).
  { role: "importer", terms: [/import(?!an)/, "importeur", "einfuhr", "ithalat"] },
  { role: "manufacturer", terms: ["hersteller", "manufacturer", "produktion", "manufaktur", "üretici", "fabrikation"] },
  { role: "ecommerce", terms: ["onlineshop", "online-shop", "warenkorb", "in den warenkorb", "add to cart", "zum warenkorb", "online bestellen"] },
  { role: "retail_chain", terms: ["filialen", "filiale", "stores", "branches", "şubelerimiz"] },
  { role: "boutique", terms: ["boutique", "butik"] },
  { role: "department_store", terms: ["kaufhaus", "department store"] },
  { role: "retailer", terms: ["einzelhandel", "retail", "ladengeschäft", "perakende"] },
  // "sourcing" must not fire on "outsourcing"/"resourcing" (§V3.2). "beschaffung"
  // is internal procurement on a retailer's site, so it is no longer a sourcing
  // ROLE on its own — a firm that procures for itself is a buyer, not a supplier.
  { role: "sourcing", terms: [/(?<!out|re)sourcing/, "procurement services", "sourcing agent", "einkaufsbüro"] },
];

/** Role vocabulary in every market we search, folded into the German/English base.
 *
 *  These are ALWAYS ON, never gated on a detected language (§V3.9). A German firm's
 *  English export page and an Italian firm's German landing page must both stay
 *  readable, and matching against text we have already downloaded costs nothing. */
const ROLE_KEYWORDS: Array<{ role: string; terms: Array<string | RegExp> }> = ROLE_KEYWORDS_BASE.map((entry) => ({
  role: entry.role,
  terms: [...entry.terms, ...(ROLE_TERMS_MULTILANG[entry.role] ?? [])],
}));

// Explicit, unambiguous B2B/wholesale markers only. Bare "vertrieb" is excluded
// on purpose (see distributor note above) — it is not proof of a B2B channel (§3/§8).
const B2B_TERMS = ["großhandel", "grosshandel", "b2b", "wiederverkäufer", "wiederverkaufer", "händler werden", "handler werden", "für händler", "fur handler", "geschäftskunden", "geschaftskunden", "wholesale", ...B2B_TERMS_MULTILANG];
const B2C_TERMS = ["warenkorb", "in den warenkorb", "add to cart", "onlineshop", "online-shop", "endkunden", "privatkunden", ...B2C_TERMS_MULTILANG];

/** Decision-maker role labels literally searched for in Impressum/pages (§3/§6).
 *  "Vertreten durch" is deliberately excluded — it too often precedes an address
 *  rather than a name, which would risk a fabricated-looking contact.
 *
 *  V3 (§3): the dictionary is EXPANDED with commercial buyer/procurement/sales
 *  roles in German + English. Each is still gated by the Impressum check, a strict
 *  "Firstname Lastname" match right after the marker, and the NAME_STOPWORDS filter,
 *  so widening the vocabulary never widens false positives. Order matters: the more
 *  specific multi-word markers must come before their single-word prefixes so the
 *  right label wins (e.g. "Head of Purchasing" before a bare purchasing form). */
const DM_ROLE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Leadership (V2.1).
  { label: "Geschäftsführer", re: /gesch[aä]ftsf[uü]hr(?:er|erin|ung)\s*:?\s*/i },
  { label: "Inhaber", re: /inhaber(?:in)?\s*:?\s*/i },
  { label: "Managing Director", re: /managing director\s*:?\s*/i },
  { label: "CEO", re: /\bceo\b\s*:?\s*/i },
  { label: "Owner", re: /owner\s*:?\s*/i },
  { label: "Founder", re: /founder\s*:?\s*/i },
  // Purchasing / procurement (V3, §3) — the roles that actually buy.
  { label: "Head of Purchasing", re: /head of purchasing\s*:?\s*/i },
  { label: "Head of Procurement", re: /head of procurement\s*:?\s*/i },
  { label: "Purchasing Director", re: /purchasing director\s*:?\s*/i },
  { label: "Procurement Director", re: /procurement director\s*:?\s*/i },
  { label: "Purchasing Manager", re: /purchasing manager\s*:?\s*/i },
  { label: "Procurement Manager", re: /procurement manager\s*:?\s*/i },
  { label: "Einkaufsleiter", re: /einkaufsleiter(?:in)?\s*:?\s*/i },
  { label: "Einkauf", re: /leiter(?:in)? einkauf\s*:?\s*/i },
  { label: "Buyer", re: /\bbuyer\b\s*:?\s*/i },
  // Commercial / sales / export leadership (V3, §3).
  { label: "Commercial Director", re: /commercial director\s*:?\s*/i },
  { label: "Sales Director", re: /sales director\s*:?\s*/i },
  { label: "Vertriebsleiter", re: /vertriebsleiter(?:in)?\s*:?\s*/i },
  { label: "Export Manager", re: /export[- ]?manager(?:in)?\s*:?\s*/i },
  // Every other market we search (§V3.9). Appended rather than interleaved so the
  // German/English precedence above is untouched; the multi-language list carries
  // its own specific-before-generic ordering.
  ...DM_ROLE_PATTERNS_MULTILANG,
];

/** Titles/honorifics that may sit between a role marker and the actual name
 *  ("Geschäftsführer: Herr Max Mustermann", "Gérant : Monsieur Jean Dupont").
 *  Stripped before name capture so the honorific is never mistaken for a first
 *  name (§6 — no fabricated-looking name). */
const NAME_TITLE_RE = NAME_TITLE_MULTILANG_RE;

/** Tokens that must never be accepted as a person's name (geography, org forms,
 *  common legal-page words). Guards against turning an address into a "contact". */
const NAME_STOPWORDS = new Set([
  "berlin", "hamburg", "münchen", "munchen", "köln", "koln", "frankfurt", "stuttgart",
  "düsseldorf", "dusseldorf", "deutschland", "germany", "österreich", "osterreich",
  "schweiz", "straße", "strasse", "str", "platz", "weg", "allee", "gmbh", "kg", "ag",
  "geschäft", "geschaft", "handel", "vertrieb", "die", "der", "das", "und", "post",
  "email", "mail", "telefon", "kontakt", "impressum", "inhalte", "inhalt",
  "unser", "unsere", "für", "fur", "von", "bei", "mit", "im", "am", "zur", "zum",
  "startseite", "home", "über", "uber", "firma", "company",
  ...NAME_STOPWORDS_MULTILANG,
]);

function looksLikeName(first?: string, last?: string): boolean {
  if (!first || !last) return false;
  const parts = normalizeForMatch(`${first} ${last}`).split(/\s+/);
  return parts.every((p) => p.length >= 2 && !NAME_STOPWORDS.has(p));
}

const ORG_FORM_RE = /^(gmbh|ag|kg|ohg|ug|ek|ltd|inc|gbr|sarl|sas|sasu|eurl|srl|srls|spa|snc|sl|slu|sau|sa|bv|nv|vof|bvba|sprl|lda|oy|oyj|ab|as|aps|kft|zrt|sro|doo|plc|llc|sti)$/i;

/**
 * UI/navigation/legal-boilerplate words that sit right next to a legal-form
 * token SOMEWHERE on a crawled page without being part of anyone's name — a
 * "Datenschutz" heading, a cookie banner's "Widerruf · Retouren · Entsorgung"
 * footer nav, a checkout page's "Zahlarten · Versandarten". `LEGAL_FORM_RE`
 * only knows "word(s) then GmbH/AG/Inc.", so on a page with no clean Impressum
 * paragraph it can walk straight into one of these instead of the real entity.
 * Fed into the same leading-token stripper `cleanLegalName` already uses, so a
 * hit here is dropped exactly like the existing "Inhalte loveco GmbH" case,
 * regardless of capitalisation (found live: "About Us AG", "Suchvorschläge
 * Günter Tilly GmbH" — real name only surfaces once "Suchvorschläge" strips).
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
  // real German legal-entity names ("Otto Versand GmbH", and a live case here,
  // "WIEDEMANN Dienstleistung und Verwaltung GmbH" — stripping "Dienstleistung"
  // would have further truncated an already brand-clipped capture). Ambiguous
  // words are left in, not out — a false NEGATIVE here just means occasionally
  // failing to drop real leaked text, which the identity-overlap check in
  // verify.ts still catches downstream; a false POSITIVE silently destroys a
  // real company name, which is worse and unrecoverable.
]);
const LEGAL_NAME_STOPWORDS = new Set([...NAME_STOPWORDS, ...LEGAL_NAME_LEAK_WORDS]);

/**
 * Well-known THIRD-PARTY organisations that show up on almost every commercial
 * site's own privacy/cookie/analytics disclosure ("this site uses Google
 * Analytics, provided by Google Inc.") — matching `LEGAL_FORM_RE` perfectly
 * while never being the searched firm's own entity. Live cases: "Alphabet
 * Inc.", "Dolby Laboratories Inc." (a hifi shop's certification blurb),
 * "Webanalysedienst der Google Inc.". Checked against the tokens that remain
 * AFTER boilerplate stripping, so this only fires when the third-party name is
 * the whole remaining result, not merely mentioned nearby.
 */
const THIRD_PARTY_ORG_NAMES = new Set([
  "google", "alphabet", "facebook", "meta", "youtube", "instagram", "twitter",
  "microsoft", "amazon", "dolby", "stripe", "paypal", "hotjar", "doubleclick",
  "cloudflare", "matomo", "hubspot", "mailchimp", "sentry", "wix", "shopify",
  // Hosting providers named in the mandatory "2. Hosting" disclosure that
  // German privacy-policy generators insert — found live on weltladen-pankow.de
  // ("Anbieter ist die Strato AG…"), the same failure mode as the platforms
  // above: a real name, printed on the page, that is never the FIRM's own.
  "strato",
]);

/** Is this token a legal-entity suffix rather than part of the name? Dots and
 *  commas are stripped first so "S.p.A." and "B.V." are recognised alongside
 *  "GmbH". Used to tell "loveco GmbH" (name + form) from "adresinde Calzedonia
 *  S.p.A" (leaked word + name + form). */
function isOrgFormToken(token: string): boolean {
  return ORG_FORM_RE.test(token.replace(/[.,&]/g, ""));
}

/** Drop leading non-name words (e.g. "Inhalte") that can leak into a captured
 *  legal name, keeping "loveco GmbH" rather than "Inhalte loveco GmbH". Returns
 *  null if nothing but the org form remains (a bare "GmbH" is not a company name). */
function cleanLegalName(raw: string): string | null {
  let tokens = raw.trim().split(/\s+/);

  // A non-final token ending in "." means the capture crossed a sentence/section
  // boundary (stripped HTML leaves no other punctuation cue) — e.g. "Hausgeräte.
  // ERREICHBARKEIT ANFAHRT AG" is two unrelated page fragments glued together by
  // proximity, not a name. Keep only what comes after the last such break. The
  // length guard (>5 incl. the period) keeps genuine short abbreviations inside a
  // real name intact — "Müller u. Söhne GmbH", "Meyer Co. KG" — while still
  // catching a full word that happened to end a sentence.
  const breakIdx = tokens.findIndex((t, i) => {
    if (i >= tokens.length - 1 || isOrgFormToken(t)) return false;
    const bare = t.replace(/[,&]/g, "");
    return /\.$/.test(bare) && bare.length > 5;
  });
  if (breakIdx >= 0) tokens = tokens.slice(breakIdx + 1);
  if (tokens.length === 0) return null;

  // Also drop a leading bare number or copyright mark: the legal entity is very
  // often printed in the footer right after the year, and Hunkemöller's came back
  // as "2026 Hunkemöller B.V." on the first multi-language run (§V3.9).
  while (
    tokens.length > 1 &&
    (LEGAL_NAME_STOPWORDS.has(normalizeForMatch(tokens[0]!)) || /^(?:[©®]|\d{2,4}|[©®]\d{2,4})$/.test(tokens[0]!))
  ) {
    tokens.shift();
  }
  // Drop leading ORDINARY WORDS that the surrounding sentence leaked in.
  //
  // The capture takes up to three tokens before the legal form, so a sentence like
  // "…adresinde Calzedonia S.p.A…" yields "adresinde Calzedonia S.p.A". The tell is
  // capitalisation: a leaked sentence word is lowercase while the name that follows
  // is not. The org-form token is excluded from that test on purpose — otherwise
  // "loveco GmbH", a genuinely lowercase brand, would be stripped down to "GmbH".
  while (
    tokens.length > 1 &&
    tokens[0]! === tokens[0]!.toLocaleLowerCase("de") &&
    tokens.slice(1).some((t) => !isOrgFormToken(t) && t !== t.toLocaleLowerCase("de"))
  ) {
    tokens.shift();
  }
  if (tokens.length < 2 && isOrgFormToken(tokens[0] ?? "")) return null;

  // Purely numeric remainder ("4672 60 966 AG") is not a name, whatever slipped
  // past the leading-token stripper above.
  const nonOrgTokens = tokens.filter((t) => !isOrgFormToken(t));
  if (nonOrgTokens.length === 0 || nonOrgTokens.every((t) => /^\d+$/.test(t))) return null;

  // A well-known THIRD PARTY (Google, Meta, Dolby…) named in a privacy/cookie/
  // analytics disclosure elsewhere on the page is never the searched firm's own
  // entity, even though it matches the exact same "Name Inc./AG" shape.
  const normNonOrg = nonOrgTokens.map((t) => normalizeForMatch(t.replace(/[.,]/g, "")));
  if (normNonOrg.every((t) => THIRD_PARTY_ORG_NAMES.has(t))) return null;

  return tokens.join(" ");
}

/** Obvious placeholder / example emails that appear in templates, not real
 *  contacts — never stored (§18). The example vocabulary is multi-language: a live
 *  Italian site served its form hint as "kullanici@ornek.com", Turkish for
 *  user@example.com, and the German-English list let it through as a real contact. */
function isPlaceholderEmail(e: string): boolean {
  const local = e.split("@")[0] ?? "";
  const domain = e.split("@")[1] ?? "";
  if (
    /^(du|name|vorname|nachname|max|erika|mustermann|your|you|example|test|email|info-|nom|prenom|nome|cognome|nombre|apellido|naam|imie|isim|ad|soyad|kullanici|utente|usuario|utilisateur|gebruiker|uzytkownik)$/i.test(
      local,
    )
  ) {
    return true;
  }
  if (
    /(example\.|email\.com|domain\.|muster|sentry|wixpress|test\.|ornek|esempio|ejemplo|exemple|exemplo|voorbeeld|przyklad|priklad)/i.test(
      domain,
    )
  ) {
    return true;
  }
  return false;
}

/** Labels that introduce a VAT id on a legal page, across the markets we search
 *  (§V3.7). Word boundaries are NOT decoration here: an early probe matched the
 *  bare letters "nif" inside "Knifeless Tape" on a real shop's page and would
 *  have sent a product name to VIES. */
const VAT_LABEL_RE =
  /\b(?:ust[-\s]?id(?:nr)?|umsatzsteuer[-\s]?identifikationsnummer|vat\s*(?:id|no\.?|number|reg)?|tva(?:\s*intracommunautaire)?|partita\s*iva|p\.?\s?iva|btw[-\s]?nummer|nif|nipc|cif|momsnr|alv[-\s]?nro)\b/i;

/** A VAT id as printed: country prefix then 8–12 alphanumerics, run together.
 *  The trailing guard matters — NKD's Impressum reads
 *  "USt-IdNr.: DE293542139 WEEE-Reg.-Nr.: …", and a pattern that tolerated
 *  internal spaces swallowed "WEEE" into the number and made a perfectly valid
 *  id unverifiable. */
const VAT_ID_COMPACT = /\b([A-Z]{2})[\s.-]{0,2}([0-9A-Z]{8,12})(?![0-9A-Z])/;
/** Fallback for markets that print the id in spaced groups ("FR 12 345678901").
 *  Only accepted if the separators strip down to a plausible length. */
const VAT_ID_SPACED = /\b([A-Z]{2})[\s.-]{0,2}((?:[0-9A-Z][\s.-]{0,1}){8,14})(?![0-9A-Z])/;

/** Pull a VAT id out of legal-page text: find a label, then read the id that
 *  follows it within a short window. Requiring the label keeps this from
 *  harvesting arbitrary alphanumeric tokens — an early probe matched a product
 *  name because the bare letters "nif" appear inside "Knifeless Tape". */
function findVatId(text: string): string | undefined {
  const label = text.match(VAT_LABEL_RE);
  if (!label || label.index == null) return undefined;
  const from = label.index + label[0].length;
  const window = text.slice(from, from + 80);

  const compact = window.match(VAT_ID_COMPACT);
  if (compact) return `${compact[1]}${compact[2]}`;

  const spaced = window.match(VAT_ID_SPACED);
  if (spaced) {
    const digits = (spaced[2] ?? "").replace(/[\s.-]/g, "");
    if (digits.length >= 8 && digits.length <= 12) return `${spaced[1]}${digits}`;
  }
  return undefined;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:tel:|telefon:?|phone:?|\+)[\s]?[\d\s()/.+-]{6,}/gi;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(website: string): string | null {
  try {
    const u = website.includes("://") ? website : `https://${website}`;
    const url = new URL(u);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Extract a person name that appears right after a role marker. Deliberately
 *  conservative: only accepts a "Firstname Lastname" (optionally with a middle
 *  token) so we never store a fragment as a person (§18). The name pattern is
 *  Latin-script-wide (§V3.9) — the German-only original could not see François,
 *  Łukasz, Öztürk or D'Angelo. */
function nameAfter(text: string, re: RegExp): { first?: string; last?: string } | null {
  const m = text.match(re);
  if (!m || m.index == null) return null;
  let after = text.slice(m.index + m[0].length, m.index + m[0].length + 70);
  // Drop a leading honorific (Herr/Frau/Monsieur/Sig./Sr./Dr…) so it isn't
  // captured as a name (§6).
  after = after.replace(NAME_TITLE_RE, "");
  const nm = after.match(PERSON_NAME_RE);
  if (!nm) return null;
  const parts = `${nm[1]} ${nm[2]}`.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function numberBefore(text: string, unitTerms: string[]): number | null {
  for (const term of unitTerms) {
    const re = new RegExp(`(\\d{1,6})\\s*(?:\\+)?\\s*${term}`, "i");
    const m = text.match(re);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 1_000_000) return n;
    }
  }
  return null;
}

async function fetchPage(url: string, timeoutMs = 12_000): Promise<string | null> {
  try {
    const res = await cachedLeadFetch({
      provider: "website",
      query: { url },
      url,
      parse: (t) => t, // keep raw HTML
      timeoutMs,
      ttlDays: 30,
      // Company sites are untrusted third parties — one of them (a real Berlin
      // lead) reliably crashed the process through undici's parser (§V3.4).
      safeHttp: true,
    });
    return typeof res.payload === "string" ? res.payload : null;
  } catch {
    return null;
  }
}

/** The shallow pass fetches MANY more homepages than the old single-pass design,
 *  so dead/slow hosts dominate its wall time: every unreachable site costs a full
 *  timeout. A tighter budget there keeps the widened coverage affordable — a
 *  homepage that cannot answer in 7s is not worth holding the run for, and it
 *  stays honestly "UNREACHABLE" rather than being called inactive (§V3.3). */
const SHALLOW_TIMEOUT_MS = 7_000;

/** Budget for a sub-page once the homepage has already answered (§V3.6). */
const SUBPAGE_TIMEOUT_MS = 8_000;

/**
 * Read the homepage's OWN links to find where this site keeps its legal and
 * company pages, instead of guessing paths at the root (§V3.9).
 *
 * Guessing is what breaks on real European sites. Calzedonia, Women'secret and
 * Esotiq all serve their legal notice under a locale prefix — /es/aviso-legal,
 * /it/note-legali — so every root-relative guess 404s and the firm comes back with
 * nothing but a homepage, which is exactly what the first live test showed. The
 * site itself already tells us the right URL in its own footer, and that footer is
 * in HTML we have ALREADY downloaded, so reading it costs no request at all.
 *
 * Links are classified by href AND by anchor text, because a French footer links
 * "/legal/12" with the words "Mentions légales".
 *
 * Only four pages are ever read, so ORDER decides what a firm gets known by. The
 * ranking is by how reliably a page names the legal entity: a statutory notice
 * first, then the privacy policy (the GDPR obliges every EU site to name its data
 * controller there, which makes it the most dependable page on the continent),
 * then contact, then anything else. Shallower paths win ties — Hunkemöller's
 * /privacy carries "Hunkemöller B.V." while its /over-ons/corporate-social-
 * responsibility carries nothing, and without this the deep sub-page displaced it.
 */
const PRIVACY_HINT_RE = /(privacy|datenschutz|confidentialite|privacid|prywatnosci|gizlilik|tietosuoja|osobnich)/i;
const CONTACT_HINT_RE = /(contact|kontakt|contatti|contacto|contactos|iletisim|yhteystiedot)/i;

/** File types a crawler has no business requesting — shared between the footer-link
 *  scrape and the sitemap fallback below so both apply the exact same rule. */
const NON_CRAWLABLE_EXT_RE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|exe|msi|dmg|pkg|apk|rar|7z|bin)$/i;

function discoverInfoPages(html: string, base: string): string[] {
  const found: Array<{ url: string; rank: number; depth: number }> = [];
  const seen = new Set<string>();
  let host: string;
  try {
    host = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }

  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
    if (found.length >= 24) break;
    const href = m[1] ?? "";
    if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue;

    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    // Same site only — a link to a payment provider's imprint is not this firm's.
    if (abs.hostname.replace(/^www\./, "") !== host) continue;
    // Found live: a "Datenschutz" link on cebus-computer.de actually pointed at
    // a TeamViewer remote-support installer — non-HTML file types were excluded
    // by extension, but never executables/archives a crawler has no business
    // requesting at all.
    if (NON_CRAWLABLE_EXT_RE.test(abs.pathname)) continue;

    const url = `${abs.origin}${abs.pathname}`.replace(/\/$/, "");
    if (url === base || seen.has(url)) continue;

    const label = foldAccents(stripTags(m[2] ?? ""));
    const path = foldAccents(abs.pathname);
    const hit = (re: RegExp) => re.test(path) || re.test(label);

    let rank: number;
    if (hit(LEGAL_PAGE_RE)) rank = 0;
    else if (hit(COMPANY_INFO_PAGE_RE)) rank = hit(PRIVACY_HINT_RE) ? 1 : hit(CONTACT_HINT_RE) ? 2 : 3;
    // Product/catalog pages (§ audit finding — crawling only ever asked for
    // legal/disclosure pages, so product-fit evidence could only ever come from
    // whatever text happened to sit on the homepage or an about/contact page; a
    // dedicated product page is what could actually CONFIRM or REFUTE a product
    // claim). Ranked below every legal/contact category so identity and
    // decision-maker discovery are never displaced by it — this only ever
    // spends a leftover slot in the SAME 3-subpage budget, never a new one.
    else if (hit(HIGH_VALUE_PATH_RE)) rank = 4;
    else continue;

    seen.add(url);
    found.push({ url, rank, depth: abs.pathname.replace(/\/$/, "").split("/").length });
  }

  return found
    .sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.url.length - b.url.length)
    .map((f) => f.url);
}

/**
 * Fallback page discovery via /sitemap.xml, for the exact case `discoverInfoPages`
 * cannot solve: a script-built footer with no legal/company links anywhere in the
 * server-rendered HTML (measured live — Esotiq, Women'secret). A sitemap is a
 * strict superset of what a working footer already gives us for free, so this is
 * ONLY ever tried when the footer scrape found nothing — running it
 * unconditionally would just be a second, costlier way to find the same pages, and
 * would double the sub-page request budget for every firm instead of only the
 * ones that actually need it.
 *
 * Deliberately does NOT follow a <sitemapindex> to its child sitemaps — a large
 * site can nest dozens of them, and chasing that is unbounded cost for a module
 * that is supposed to spend a fixed, small budget per candidate. An index sitemap
 * simply yields nothing here, which is honest: the firm falls back to the
 * existing guessed-path behaviour, same as before this fallback existed.
 *
 * No anchor text exists in a sitemap (unlike a footer link), so this has no way
 * to tell a privacy policy from a contact page the way `discoverInfoPages` does
 * with `PRIVACY_HINT_RE`/`CONTACT_HINT_RE` — every company-info hit shares one
 * rank. That is an acceptable loss: the goal here is finding a page AT ALL on a
 * site that currently yields none, not fine-tuning which one wins a tie.
 */
function discoverSitemapPages(xml: string, base: string): string[] {
  if (/<sitemapindex[\s>]/i.test(xml)) return [];
  const found: Array<{ url: string; rank: number; depth: number }> = [];
  const seen = new Set<string>();
  let host: string;
  try {
    host = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }

  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    if (found.length >= 24) break;
    let abs: URL;
    try {
      abs = new URL(m[1] ?? "");
    } catch {
      continue;
    }
    if (abs.hostname.replace(/^www\./, "") !== host) continue;
    if (NON_CRAWLABLE_EXT_RE.test(abs.pathname)) continue;

    const url = `${abs.origin}${abs.pathname}`.replace(/\/$/, "");
    if (url === base || seen.has(url)) continue;

    const path = foldAccents(abs.pathname);
    let rank: number;
    if (LEGAL_PAGE_RE.test(path)) rank = 0;
    else if (COMPANY_INFO_PAGE_RE.test(path)) rank = 3;
    else if (HIGH_VALUE_PATH_RE.test(path)) rank = 4;
    else continue;

    seen.add(url);
    found.push({ url, rank, depth: abs.pathname.replace(/\/$/, "").split("/").length });
  }

  return found
    .sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.url.length - b.url.length)
    .map((f) => f.url);
}

/** How deeply to read a site (§V3.3).
 *  "shallow" — homepage only (1 request). Enough for reachability, product terms,
 *              role/model signals and social links, i.e. everything qualification
 *              needs to decide whether a candidate is worth a closer look.
 *  "full"    — homepage + Impressum/Kontakt/about, which is where legal name,
 *              decision-makers and contact details live.
 *  The staged pipeline runs "shallow" over a WIDE set and promotes only the
 *  promising ones to "full"; because every page is cached per URL, the deep pass
 *  re-uses the already-fetched homepage and pays only for the sub-pages. */
export type SiteDepth = "shallow" | "full";

/**
 * Gather website intelligence for a company. Fetches the homepage first; only if
 * it is reachable (and depth is "full") does it try a couple of high-signal
 * sub-pages. `productTerms` are the local-language terms the caller wants to
 * confirm on the site.
 *
 * `country` is the ISO code the firm was discovered in. It only ever selects WHICH
 * sub-page paths to ask for (§V3.9) — never which words to look for, because the
 * text dictionaries are all-language and always on. The site's own ccTLD outranks
 * it when there is one.
 */
export async function fetchSiteIntel(
  website: string,
  productTerms: string[],
  signals?: ProductSignals,
  depth: SiteDepth = "full",
  country?: string | null,
): Promise<SiteIntel | null> {
  const base = normalizeUrl(website);
  if (!base) return null;
  const lang = langForSite(website, country);

  const home = await fetchPage(base, depth === "shallow" ? SHALLOW_TIMEOUT_MS : 12_000);
  if (home == null) {
    return {
      status: "UNREACHABLE",
      finalUrl: base,
      pagesFetched: [],
      emails: [],
      phones: [],
      productTermsFound: [],
      strongFound: [],
      mediumFound: [],
      roleSignals: [],
      modelSignals: { b2b: false, b2c: false },
      decisionMakers: [],
      socials: [],
    };
  }

  const pages: Array<{ url: string; html: string }> = [{ url: base, html: home }];
  // Sub-pages, in PARALLEL ROUNDS rather than one at a time (§V3.6).
  //
  // These were fetched strictly sequentially, so a company whose /impressum and
  // /kontakt happen not to exist paid a full timeout for each miss before even
  // trying the next — up to six round trips in a row for one firm, and the deep
  // pass was the slowest phase of the whole search because of it.
  //
  // Each round asks for a few paths at once and stops as soon as we have enough,
  // so the common case (a German site with /impressum) is a single round. Rounds
  // are small on purpose: unlike the shallow pass, these all hit the SAME host,
  // and hammering one server with six simultaneous requests is not something a
  // polite crawler does. Skipped entirely on a shallow read.
  //
  // WHICH pages are asked for is the one language-dependent part of verification
  // (§V3.9), and the request count is unchanged. Two sources, in order:
  //
  //   1. Links the homepage itself publishes. Free — the HTML is already in hand —
  //      and correct even when the site nests everything under a locale prefix
  //      (/es/aviso-legal) or an opaque id (/legal/12 labelled "Mentions légales").
  //   2. The country's conventional paths, as a fallback for sites whose footer is
  //      script-built. A French site is asked for /mentions-legales, /contact,
  //      /qui-sommes-nous rather than three guaranteed 404s on the German set.
  if (depth === "full") {
    let discovered = discoverInfoPages(home, base);
    // Footer scrape found nothing — try the sitemap before falling back to
    // guessed conventional paths (§ audit backlog: script-built footers).
    if (discovered.length === 0) {
      const sitemapXml = await fetchPage(`${base}/sitemap.xml`, SUBPAGE_TIMEOUT_MS);
      if (sitemapXml) discovered = discoverSitemapPages(sitemapXml, base);
    }
    const guessed = subpageRounds(lang).flat().map((p) => `${base}/${p}`);
    const queue: string[] = [];
    for (const u of [...discovered, ...guessed]) if (!queue.includes(u)) queue.push(u);

    // Same shape as before: small parallel rounds of three, at most two of them.
    // Rounds stay small on purpose — unlike the shallow pass these all hit the
    // SAME host, and hammering one server with six simultaneous requests is not
    // something a polite crawler does.
    for (let i = 0; i < queue.length && i < 6; i += 3) {
      if (pages.length >= 4) break;
      const round = queue.slice(i, i + 3);
      const results = await Promise.all(
        round.map(async (url) => ({
          url,
          // The homepage already proved this host answers, so a sub-page that
          // stalls is a dead path rather than a slow server: it does not earn
          // the full budget.
          html: await fetchPage(url, SUBPAGE_TIMEOUT_MS),
        })),
      );
      // Keep the declared priority, not whichever answered first, so the pages a
      // firm gets read are deterministic.
      for (const r of results) {
        if (pages.length >= 4) break;
        if (r.html) pages.push({ url: r.url, html: r.html });
      }
    }
  }

  const emails = new Set<string>();
  const phones = new Set<string>();
  const roleSignals = new Set<string>();
  const productTermsFound = new Set<string>();
  const strongFound = new Set<string>();
  const mediumFound = new Set<string>();
  const socialsByPlatform = new Map<string, string>();
  const decisionMakers: DecisionMaker[] = [];
  let legalName: string | undefined;
  let title: string | undefined;
  let vatId: string | undefined;
  let storeCount: number | undefined;
  let employeeCount: number | undefined;
  let b2b = false;
  let b2c = false;

  const normProductTerms = productTerms.map((t) => normalizeForMatch(t)).filter((t) => t.length >= 3);
  const strongTerms = (signals?.strong ?? []).map((t) => normalizeForMatch(t)).filter((t) => t.length >= 3);
  const mediumTerms = (signals?.medium ?? []).map((t) => normalizeForMatch(t)).filter((t) => t.length >= 3);

  for (const { url, html } of pages) {
    const text = stripTags(html);
    const lower = normalizeForMatch(text);
    // Two tiers of company-disclosure page (§V3.9).
    //
    // Germany's Impressum is a legal obligation to name the managing directors, so
    // a name printed there is an official disclosure. Most of Europe has no such
    // page: French, Italian and Spanish firms put their management on
    // /qui-sommes-nous, /chi-siamo or /contacto instead, and the privacy policy
    // names the data controller everywhere in the EU because the GDPR requires it.
    // Reading only the strict legal page meant every non-German firm came back with
    // no decision-maker at all. Both tiers are now read; the weaker one simply
    // carries lower confidence, which is what the confidence field is for.
    const isLegalPage = LEGAL_PAGE_RE.test(url) || LEGAL_PAGE_RE.test(lower.slice(0, 400));
    const isCompanyInfo = isLegalPage || COMPANY_INFO_PAGE_RE.test(url);
    const context = pageContext(url);

    // The FIRST page's title only (the homepage) — a sub-page title is about the
    // sub-page ("Impressum"), not about who the company is.
    if (title === undefined && url === base) {
      const t = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
      const cleaned = t?.[1] ? stripTags(t[1]).replace(/\s+/g, " ").trim() : "";
      if (cleaned) title = cleaned;
    }

    // Emails / phones — only what's literally present (placeholders excluded).
    for (const e of html.match(EMAIL_RE) ?? []) {
      const em = e.toLowerCase();
      if (!/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(em) && !isPlaceholderEmail(em)) {
        emails.add(em);
      }
    }
    for (const p of text.match(PHONE_RE) ?? []) {
      const cleaned = p.replace(/(tel:|telefon:?|phone:?)/i, "").trim();
      if (cleaned.replace(/\D/g, "").length >= 7) phones.add(cleaned);
    }

    // Role + model signals — from pages that actually speak about the business.
    //
    // The same page-context rule V3.1 applied to product terms applies here, and
    // for the same reason: boilerplate is not evidence. A privacy policy discusses
    // the "distribution" of personal data and a careers page discusses the company
    // in the abstract; neither says what this firm sells or who it sells to.
    if (context !== "LOW_VALUE") {
      for (const { role, terms } of ROLE_KEYWORDS) {
        if (terms.some((t) => (typeof t === "string" ? lower.includes(t) : t.test(lower)))) {
          roleSignals.add(role);
        }
      }
      if (B2B_TERMS.some((t) => lower.includes(t))) b2b = true;
      if (B2C_TERMS.some((t) => lower.includes(t))) b2c = true;
    }

    // Product term evidence (flat + tiered, §2/§V3.1).
    // V3.1: Product signals from LOW_VALUE pages (career/news/blog) are NOT added to
    // strongFound/mediumFound, as they don't prove the company's own products. Career
    // page "Dessous" ≠ company sells dessous. Homepage "Lingerie" → company sells lingerie.
    for (const t of normProductTerms) if (includesTermBoundary(lower, t)) productTermsFound.add(t);
    if (context !== "LOW_VALUE") {
      for (const t of strongTerms) if (includesTermBoundary(lower, t)) strongFound.add(t);
      for (const t of mediumTerms) if (includesTermBoundary(lower, t)) mediumFound.add(t);
    }
    // Note: LOW_VALUE pages are still crawled but their product signals are not counted
    // toward VERIFIED/LIKELY; this is a conservative "absence of proof ≠ proof of absence".

    // Social profile links on the company's OWN pages (§15). First URL per
    // platform wins; generic share/intent links are skipped.
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
      const url = m[0];
      if (/\/(sharer|share|intent|plugins|dialog)\b/i.test(url)) continue;
      for (const p of SOCIAL_PLATFORMS) {
        if (p.test.test(url) && !socialsByPlatform.has(p.key)) {
          socialsByPlatform.set(p.key, url.replace(/[)"'.,]+$/, ""));
        }
      }
    }

    // Scale signals (only if literally stated), in every language we read (§V3.9).
    storeCount =
      storeCount ??
      numberBefore(lower, ["filialen", "filialen in", "standorte", "stores", "branches", "şube", ...STORE_TERMS_MULTILANG]) ??
      undefined;
    employeeCount =
      employeeCount ??
      numberBefore(lower, ["mitarbeiter", "mitarbeitende", "beschäftigte", "employees", "çalışan", ...EMPLOYEE_TERMS_MULTILANG]) ??
      undefined;

    // Legal name, VAT id and decision-makers from a company-disclosure page (§6).
    if (isCompanyInfo) {
      vatId = vatId ?? findVatId(text);
      const legal = text.match(LEGAL_FORM_RE);
      const cleaned = legal && legal[1] ? cleanLegalName(legal[1]) : null;
      if (cleaned) legalName = legalName ?? cleaned;
      for (const { label, re } of DM_ROLE_PATTERNS) {
        const nm = nameAfter(text, re);
        if (nm && looksLikeName(nm.first, nm.last)) {
          const exists = decisionMakers.some((d) => d.firstName === nm.first && d.lastName === nm.last);
          if (!exists) {
            decisionMakers.push({
              firstName: nm.first,
              lastName: nm.last,
              role: label,
              sourceUrl: url,
              // An official legal notice is a stronger source than an about or
              // contact page, and the difference is recorded rather than flattened:
              // 85 for a statutory disclosure, 70 for a self-published company page.
              confidence: isLegalPage ? 85 : 70,
            });
          }
        }
      }
    }
  }

  return {
    status: "ACTIVE",
    finalUrl: base,
    pagesFetched: pages.map((p) => p.url),
    emails: Array.from(emails).slice(0, 10),
    phones: Array.from(phones).slice(0, 6),
    legalName,
    title,
    vatId,
    productTermsFound: Array.from(productTermsFound),
    strongFound: Array.from(strongFound),
    mediumFound: Array.from(mediumFound),
    roleSignals: Array.from(roleSignals),
    modelSignals: { b2b, b2c },
    storeCount,
    employeeCount,
    decisionMakers,
    socials: Array.from(socialsByPlatform.entries()).map(([platform, url]) => ({ platform, url })),
  };
}
