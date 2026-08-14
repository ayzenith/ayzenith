import "server-only";

import { cachedLeadFetch } from "../cache";
import { SOCIAL_PLATFORMS } from "@/config/leads";

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

const CANDIDATE_PATHS = [
  "", // homepage
  "impressum",
  "kontakt",
  "contact",
  "ueber-uns",
  "about",
  "about-us",
];

/** Page context classification for product/model signal weighting (§V3.1).
 *  HIGH-VALUE pages (product/shop pages) → signals weighted fully.
 *  LOW-VALUE pages (career/corporate/news) → signals weighted down (not product evidence). */
function pageContext(url: string): "HIGH_VALUE" | "LOW_VALUE" | "NORMAL" {
  const path = url.toLocaleLowerCase("de");
  // Product-focused pages
  if (
    /\/(shop|produkt|product|kategori|category|sortiment|katalog|katalogue|kollektion|collection|item|ware)(?:\/|$)/i.test(
      path,
    )
  ) {
    return "HIGH_VALUE";
  }
  // Career/corporate/news — low contextual value for product signals
  if (
    /\/(career|jobs?|karriere|partner|partnership|corporate|investor|presse|news|blog|press|newsroom|medien|media)(?:\/|$)/i.test(
      path,
    )
  ) {
    return "LOW_VALUE";
  }
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
const ROLE_KEYWORDS: Array<{ role: string; terms: Array<string | RegExp> }> = [
  { role: "wholesaler", terms: ["großhandel", "grosshandel", "wholesale", "b2b-großhandel", "wiederverkäufer", "wiederverkaufer"] },
  // "vertrieb" alone is intentionally NOT here: it means "sales/distribution dept"
  // and appears on ordinary retailer sites, falsely tagging them distributors.
  // Only the unambiguous B2B forms remain (§3/§8).
  { role: "distributor", terms: ["distribution", "distributor", "vertriebspartner", "fachdistribution", "distribütör"] },
  // "import" must not fire on "important"/"importance"/"importantes" — the single
  // greediest false positive in the whole role map (§V3.2).
  { role: "importer", terms: [/import(?!ant|ance)/, "importeur", "einfuhr", "ithalat"] },
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

// Explicit, unambiguous B2B/wholesale markers only. Bare "vertrieb" is excluded
// on purpose (see distributor note above) — it is not proof of a B2B channel (§3/§8).
const B2B_TERMS = ["großhandel", "grosshandel", "b2b", "wiederverkäufer", "wiederverkaufer", "händler werden", "handler werden", "für händler", "fur handler", "geschäftskunden", "geschaftskunden", "wholesale"];
const B2C_TERMS = ["warenkorb", "in den warenkorb", "add to cart", "onlineshop", "online-shop", "endkunden", "privatkunden"];

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
];

/** Titles/honorifics that may sit between a role marker and the actual name
 *  ("Geschäftsführer: Herr Max Mustermann"). Stripped before name capture so the
 *  honorific is never mistaken for a first name (§6 — no fabricated-looking name). */
const NAME_TITLE_RE = /^(?:herr|frau|mr|mrs|ms|dr|prof|dipl\.?-?ing|dipl|ing)\.?\s+/i;

/** Tokens that must never be accepted as a person's name (geography, org forms,
 *  common Impressum words). Guards against turning an address into a "contact". */
const NAME_STOPWORDS = new Set(
  [
    "berlin", "hamburg", "münchen", "munchen", "köln", "koln", "frankfurt", "stuttgart",
    "düsseldorf", "dusseldorf", "deutschland", "germany", "österreich", "osterreich",
    "schweiz", "straße", "strasse", "str", "platz", "weg", "allee", "gmbh", "kg", "ag",
    "geschäft", "geschaft", "handel", "vertrieb", "die", "der", "das", "und", "post",
    "email", "mail", "telefon", "kontakt", "impressum", "inhalte", "inhalt",
    "unser", "unsere", "für", "fur", "von", "bei", "mit", "im", "am", "zur", "zum",
    "startseite", "home", "über", "uber", "firma", "company",
  ].map((s) => s),
);

function looksLikeName(first?: string, last?: string): boolean {
  if (!first || !last) return false;
  const parts = `${first} ${last}`.toLocaleLowerCase("de").split(/\s+/);
  return parts.every((p) => p.length >= 2 && !NAME_STOPWORDS.has(p));
}

const ORG_FORM_RE = /^(gmbh|ag|kg|ohg|ug|e\.k\.|ltd\.?|inc\.?|gbr)$/i;

/** Drop leading non-name words (e.g. "Inhalte") that can leak into a captured
 *  legal name, keeping "loveco GmbH" rather than "Inhalte loveco GmbH". Returns
 *  null if nothing but the org form remains (a bare "GmbH" is not a company name). */
function cleanLegalName(raw: string): string | null {
  const tokens = raw.trim().split(/\s+/);
  while (tokens.length > 1 && NAME_STOPWORDS.has(tokens[0]!.toLocaleLowerCase("de"))) {
    tokens.shift();
  }
  if (tokens.length < 2 && ORG_FORM_RE.test(tokens[0] ?? "")) return null;
  return tokens.join(" ");
}

/** Obvious placeholder / example emails that appear in templates, not real
 *  contacts — never stored (§18). */
function isPlaceholderEmail(e: string): boolean {
  const local = e.split("@")[0] ?? "";
  const domain = e.split("@")[1] ?? "";
  if (/^(du|name|vorname|nachname|max|erika|mustermann|your|you|example|test|email|info-)$/i.test(local)) return true;
  if (/(example\.|email\.com|domain\.|muster|sentry|wixpress|test\.)/i.test(domain)) return true;
  return false;
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
 *  token) so we never store a fragment as a person (§18). */
function nameAfter(text: string, re: RegExp): { first?: string; last?: string } | null {
  const m = text.match(re);
  if (!m || m.index == null) return null;
  let after = text.slice(m.index + m[0].length, m.index + m[0].length + 70);
  // Drop a leading honorific (Herr/Frau/Mr/Dr…) so it isn't captured as a name (§6).
  after = after.replace(NAME_TITLE_RE, "");
  const nm = after.match(/([A-ZÄÖÜ][a-zäöüß]+)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/);
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

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await cachedLeadFetch({
      provider: "website",
      query: { url },
      url,
      parse: (t) => t, // keep raw HTML
      timeoutMs: 12_000,
      ttlDays: 30,
    });
    return typeof res.payload === "string" ? res.payload : null;
  } catch {
    return null;
  }
}

/**
 * Gather website intelligence for a company. Fetches the homepage first; only if
 * it is reachable does it try a couple of high-signal sub-pages. `productTerms`
 * are the local-language terms the caller wants to confirm on the site.
 */
export async function fetchSiteIntel(
  website: string,
  productTerms: string[],
  signals?: ProductSignals,
): Promise<SiteIntel | null> {
  const base = normalizeUrl(website);
  if (!base) return null;

  const home = await fetchPage(base);
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
  // Try a few sub-pages, but stop early once we have an Impressum + contact.
  for (const path of CANDIDATE_PATHS.slice(1)) {
    if (pages.length >= 4) break;
    const url = `${base}/${path}`;
    const html = await fetchPage(url);
    if (html) pages.push({ url, html });
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
  let storeCount: number | undefined;
  let employeeCount: number | undefined;
  let b2b = false;
  let b2c = false;

  const normProductTerms = productTerms.map((t) => t.toLocaleLowerCase("de")).filter((t) => t.length >= 3);
  const strongTerms = (signals?.strong ?? []).map((t) => t.toLocaleLowerCase("de")).filter((t) => t.length >= 3);
  const mediumTerms = (signals?.medium ?? []).map((t) => t.toLocaleLowerCase("de")).filter((t) => t.length >= 3);

  for (const { url, html } of pages) {
    const text = stripTags(html);
    const lower = text.toLocaleLowerCase("de");
    const isImpressum = /impressum/i.test(url) || /impressum/i.test(lower.slice(0, 400));
    const context = pageContext(url);

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

    // Role + model signals.
    for (const { role, terms } of ROLE_KEYWORDS) {
      if (terms.some((t) => (typeof t === "string" ? lower.includes(t) : t.test(lower)))) {
        roleSignals.add(role);
      }
    }
    if (B2B_TERMS.some((t) => lower.includes(t))) b2b = true;
    if (B2C_TERMS.some((t) => lower.includes(t))) b2c = true;

    // Product term evidence (flat + tiered, §2/§V3.1).
    // V3.1: Product signals from LOW_VALUE pages (career/news/blog) are NOT added to
    // strongFound/mediumFound, as they don't prove the company's own products. Career
    // page "Dessous" ≠ company sells dessous. Homepage "Lingerie" → company sells lingerie.
    for (const t of normProductTerms) if (lower.includes(t)) productTermsFound.add(t);
    if (context !== "LOW_VALUE") {
      for (const t of strongTerms) if (lower.includes(t)) strongFound.add(t);
      for (const t of mediumTerms) if (lower.includes(t)) mediumFound.add(t);
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

    // Scale signals (only if literally stated).
    storeCount = storeCount ?? numberBefore(lower, ["filialen", "filialen in", "standorte", "stores", "branches", "şube"]) ?? undefined;
    employeeCount = employeeCount ?? numberBefore(lower, ["mitarbeiter", "mitarbeitende", "beschäftigte", "employees", "çalışan"]) ?? undefined;

    // Legal name + decision-makers from the Impressum (strongest source, §6).
    if (isImpressum) {
      const legal = text.match(
        /((?:[A-Za-zÄÖÜäöü0-9][\wäöüß.&\-]+\s+){1,3}(?:GmbH(?: & Co\.? KG)?|AG|KG|OHG|e\.K\.|UG(?: \(haftungsbeschränkt\))?|Ltd\.?|Inc\.?|GbR))/,
      );
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
              confidence: 85, // named + titled on the official Impressum → HIGH
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
