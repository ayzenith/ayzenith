/**
 * AYZENITH LEAD FINDER — crawl planning (accuracy Phase 3).
 *
 * Decides WHICH pages of a company's site are worth the small fixed budget.
 * Pure and dependency-light on purpose (no `server-only`, no fetching) so the
 * whole plan is unit-testable: given a homepage's HTML, exactly which URLs
 * would we open, in what order, and why.
 *
 * THE PROBLEM THIS SOLVES, measured on live data before writing any of it:
 * of 1369 real crawled pages across 527 hosts, 539 were homepages, 288 contact
 * pages, 265 legal notices, 105 privacy policies — and **4 were product or
 * catalogue pages (0.29%)**. Only 3 of 527 sites (0.6%) ever had a product page
 * opened. The ranking in `discoverInfoPages` put product pages LAST (rank 4)
 * inside a 3-subpage budget, so any firm publishing Impressum + Datenschutz +
 * Kontakt links — i.e. every German site — spent the entire budget before
 * reaching the one page that could prove what it sells.
 *
 * THE LINE THIS MODULE MUST NOT CROSS: a high discovery score means "it is
 * worth looking here", never "this firm sells the product". Finding a page at
 * /produkte proves nothing on its own; only `resolveProductEvidence` decides
 * what was actually found there, and it stays exactly as strict as Phase 2 left
 * it. Discovery is aggressive, evidence is not.
 */

/** What a link is FOR, which is what the budget is split between. */
export type LinkKind = "IDENTITY" | "PRODUCT" | "OTHER";

export type RawLink = { url: string; anchor: string };

export type ScoredLink = {
  url: string;
  anchor: string;
  kind: LinkKind;
  /** Higher = open this sooner within its kind. */
  score: number;
  /** Path depth, used as a tie-break: shallower pages are more canonical. */
  depth: number;
};

// ---------------------------------------------------------------------------
// URL hygiene
// ---------------------------------------------------------------------------

/** Non-HTML assets, plus the executables a crawler has no business requesting
 *  (found live: a "Datenschutz" link pointing at a TeamViewer installer). */
const NON_CRAWLABLE_EXT_RE = /\.(jpe?g|png|gif|svg|webp|ico|css|js|zip|docx?|xlsx?|pptx?|exe|msi|dmg|pkg|apk|rar|7z|bin|mp4|mp3|avi|mov)$/i;

/** Query keys that only ever produce a duplicate of a page we already have.
 *  `utm_` and `mc_` are PREFIXES — the real keys are `utm_source`, `mc_cid` —
 *  so they carry a wildcard tail. Without it the whole rule silently matched
 *  nothing, which the benchmark caught. */
const TRACKING_PARAM_RE = /^(utm_.*|mc_.*|fbclid|gclid|msclkid|ref|source|campaign|sessionid|phpsessid|sid)$/i;

/**
 * Canonical form of a URL for de-duplication: no scheme differences, no `www.`,
 * no trailing slash, no tracking parameters, no fragment.
 *
 * Sitemaps in particular are full of the same page under `?utm_source=` and
 * `/page` vs `/page/`, and spending a slot re-reading a page we already have is
 * the cheapest possible way to waste a 3-page budget.
 */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key);
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const query = u.searchParams.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

/** Is this a page worth asking a server for at all? */
export function isCrawlableUrl(raw: string, base: string): boolean {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  let baseHost: string;
  try {
    baseHost = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  // Same site only — a link to a payment provider's imprint is not this firm's.
  if (u.hostname.replace(/^www\./, "") !== baseHost) return false;
  // PDFs are explicitly allowed: a product catalogue is often the best evidence
  // a free source can reach. Every other binary is refused.
  if (/\.pdf$/i.test(u.pathname)) return true;
  return !NON_CRAWLABLE_EXT_RE.test(u.pathname);
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Path segments that mark a commercial/product area of a site, in the four
 * markets this module actually searches plus English.
 *
 * These are DISCOVERY hints, matched against the URL PATH only — a path is
 * chosen by the site's own information architecture, which makes it a far more
 * reliable signal than link text a marketer wrote.
 */
// A product area is a whole path SEGMENT, so the delimiter is only `/` or the
// end of the path — matching the `HIGH_VALUE_PATH_RE` the evidence engine uses,
// so the crawler and the classifier cannot disagree about what a page is.
// Allowing `-` here (a first cut did) made "/shop-the-look/" and
// "/stores/store-kreuzberg/" read as product areas: FALKE spent its whole
// budget on lookbooks and Loveco on its store locator, and the evidence engine
// then classified those same pages as OTHER. Caught by the live dry run.
const PRODUCT_PATH_RE =
  /\/(products?|produkte?|produkt|produits?|producten|prodotti|productos|artikel|shop|boutique|tienda|negozio|winkel|sklep|magasin|catalog|catalogue|katalog|kataloge|catalogo|sortiment|assortiment|assortimento|collections?|kollektion|collezione|coleccion|categor(?:y|ies|ie|ien|ia|ias)|kategorien?|kategori|gamme|solutions?|loesungen|losungen|marken|brands|marques|merken|equipment)(?:\/|$)/i;

/** Paths whose product words are about SELLING TO US, not to customers. */
const COMMERCIAL_PATH_RE =
  /\/(wholesale|grosshandel|grosshaendler|fachhandel|haendler|handler|dealer|dealers|distributor|distributeur|distributori|grossiste|groothandel|reseller|wiederverkaeufer|b2b|geschaeftskunden|partner-werden)(?:\/|$)/i;

/** Identity / disclosure paths. Kept as its own vocabulary so the budget can be
 *  split by PURPOSE rather than by one flat ranking. */
const IDENTITY_PATH_RE =
  /\/(impressum|imprint|legal[-_]?notice|mentions[-_]?legales|note[-_]?legali|aviso[-_]?legal|colofon|kontakt|contact|contatti|contacto|contactos|iletisim|ueber[-_]?uns|uber[-_]?uns|about|about[-_]?us|chi[-_]?siamo|qui[-_]?sommes[-_]?nous|quienes[-_]?somos|over[-_]?ons|o[-_]?nas|hakkimizda|unternehmen|company|azienda|empresa|bedrijf|team|ansprechpartner|mitarbeiter|firmenbuch)(?:\/|$|\.|-|_)/i;

/** Paths that are never worth a slot. */
const JUNK_PATH_RE =
  /\/(agb|terms|conditions|voorwaarden|regulamin|widerruf|versand|zahlung|payment|shipping|newsletter|login|anmelden|register|warenkorb|cart|checkout|konto|account|suche|search|sitemap|karriere|career|jobs?|presse|press|blog|news|nieuws|notizie|noticias|aktuelles|magazin|faq|hilfe|help)(?:\/|$|\.|-|_)/i;

/**
 * Privacy / data-protection pages — NOT junk, despite carrying no product value
 * whatsoever (the evidence engine weights them 0.15).
 *
 * The GDPR obliges every EU site to name its data controller there, which makes
 * a privacy policy the most reliably company-NAMING page on the continent; V3.9
 * chose it as an identity source for exactly that reason. A first cut of this
 * module filed it under junk and the live dry run showed the cost at once:
 * privacy pages went 313 → 0 and KiK, whose homepage links only an Impressum
 * and a Kontakt, dropped from three chosen pages to two. So it is an identity
 * page of LAST resort — scored below every real disclosure page, picked only
 * when nothing better exists.
 */
const PRIVACY_PATH_RE =
  /\/(datenschutz|privacy|cookie|confidentialite|privacid|prywatnosci|gizlilik|tietosuoja)(?:\/|$|\.|-|_)/i;

/** Anchor words that corroborate a product path. Weaker than the path itself —
 *  "Read more products" must not outrank an actual /produkte URL. */
const PRODUCT_ANCHOR_RE =
  /\b(produkte?|products?|produits?|producten|prodotti|sortiment|assortiment|katalog|catalog(?:ue)?|catalogo|shop|kollektion|collection|collezione|colecci|kategorien?|categor|marken|brands|gamme|solutions?|loesungen|angebot|artikel)\b/i;

/** File names that mark a PDF as a product document rather than a form. */
const CATALOG_FILE_RE =
  /(katalog|catalog|catalogue|catalogo|sortiment|prospekt|brochure|broschuere|broschure|preisliste|price[-_]?list|listino|produkt|product|datenblatt|datasheet)/i;

// ---------------------------------------------------------------------------
// Link extraction + scoring
// ---------------------------------------------------------------------------

/**
 * Every internal link in the document, with its anchor text.
 *
 * Scans the WHOLE document — header, nav, mega-menu, body, cards, CTAs, footer —
 * rather than only the disclosure links the old ranking could recognise. The
 * HTML is already downloaded, so this costs nothing.
 */
export function extractLinks(html: string, base: string, cap = 400): RawLink[] {
  const out: RawLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    if (out.length >= cap) break;
    const href = (m[1] ?? "").trim();
    if (!href || /^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue;
    if (!isCrawlableUrl(href, base)) continue;
    const canon = canonicalizeUrl(href, base);
    if (!canon || seen.has(canon)) continue;
    let abs: string;
    try {
      const u = new URL(href, base);
      u.hash = "";
      abs = u.toString();
    } catch {
      continue;
    }
    seen.add(canon);
    const anchor = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    out.push({ url: abs, anchor });
  }
  return out;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Score and categorise one link.
 *
 * URL path carries the weight; anchor text only CORROBORATES it. That ordering
 * is deliberate — a path reflects how the site is actually organised, while
 * anchor text is written by a marketer, so "Read more products →" pointing at
 * /blog/2024 must not outrank /produkte. Anchor alone can still nominate a link
 * (some shops route everything through opaque ids), but at a much lower score.
 */
export function scoreLink(link: RawLink): ScoredLink {
  const path = pathOf(link.url);
  const depth = path.replace(/\/+$/, "").split("/").filter(Boolean).length;
  const anchorHit = PRODUCT_ANCHOR_RE.test(link.anchor);
  const isPdf = /\.pdf$/i.test(path);

  let kind: LinkKind = "OTHER";
  let score = 0;

  if (isPdf) {
    // A catalogue PDF is the strongest thing a free crawl can reach; any other
    // PDF (a form, a job ad, terms) is not worth a slot.
    if (CATALOG_FILE_RE.test(path) || anchorHit) {
      kind = "PRODUCT";
      score = 95;
    } else {
      return { ...link, kind: "OTHER", score: 0, depth };
    }
  } else if (JUNK_PATH_RE.test(path)) {
    // Junk stays junk even if the anchor says "Produkte" — a cookie policy is
    // not a catalogue.
    return { ...link, kind: "OTHER", score: 0, depth };
  } else if (COMMERCIAL_PATH_RE.test(path)) {
    kind = "PRODUCT";
    score = 90 + (anchorHit ? 5 : 0);
  } else if (PRODUCT_PATH_RE.test(path)) {
    kind = "PRODUCT";
    score = 80 + (anchorHit ? 8 : 0);
  } else if (IDENTITY_PATH_RE.test(path)) {
    kind = "IDENTITY";
    // A statutory notice names the company under legal obligation; contact and
    // about pages are next best.
    score = /impressum|imprint|mentions|note[-_]?legali|aviso|colofon|firmenbuch/i.test(path) ? 90
      : /kontakt|contact|contatti|contacto|iletisim/i.test(path) ? 75
        : 65;
  } else if (PRIVACY_PATH_RE.test(path)) {
    // Identity of last resort — see PRIVACY_PATH_RE.
    kind = "IDENTITY";
    score = 40;
  } else if (anchorHit) {
    // The path says nothing but the link text does. Real on shops with opaque
    // URLs; deliberately scored below any real product path.
    kind = "PRODUCT";
    score = 45;
  } else {
    return { ...link, kind: "OTHER", score: 0, depth };
  }

  // Shallower paths are more canonical: /produkte beats /produkte/a/b/c.
  score -= Math.min(depth, 5) * 2;
  return { ...link, kind, score, depth };
}

export function rankLinks(links: RawLink[]): ScoredLink[] {
  return links
    .map(scoreLink)
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score || a.depth - b.depth || a.url.length - b.url.length);
}

// ---------------------------------------------------------------------------
// Adaptive budget
// ---------------------------------------------------------------------------

export type CrawlPlan = {
  /** URLs to fetch, in order, already de-duplicated against the homepage. */
  urls: string[];
  /** Whether the sitemap is worth a request — only when product candidates are
   *  missing, so a site with a good menu never pays for one. */
  needsSitemap: boolean;
  identityQuota: number;
  productQuota: number;
  reason: string;
};

export type PlanInput = {
  ranked: ScoredLink[];
  /** Conventional paths for the site's language, as a fallback when the page
   *  publishes no usable links of its own (script-built navigation). */
  guessedIdentityUrls?: string[];
  /**
   * Is the company's identity already established from the homepage alone
   * (domain matches the name AND the page states a legal entity)? When it is,
   * a second and third disclosure page teaches us nothing and the slots go to
   * product discovery instead. When it is NOT, identity keeps the majority —
   * an unattributable site caps every product claim anyway (Phase 1), so
   * spending the budget on products first would be spending it on evidence we
   * could not use.
   */
  identityStrong: boolean;
  /** Sub-page slots available (homepage is already spent). */
  budget: number;
};

export function planCrawl(input: PlanInput): CrawlPlan {
  const budget = Math.max(0, input.budget);
  const identityQuota = input.identityStrong ? 1 : 2;
  const productQuota = Math.max(0, budget - identityQuota);

  const identity = input.ranked.filter((l) => l.kind === "IDENTITY");
  const product = input.ranked.filter((l) => l.kind === "PRODUCT");

  const chosen: string[] = [];
  const take = (list: ScoredLink[], n: number) => {
    for (const l of list) {
      if (chosen.length >= budget || n <= 0) break;
      if (chosen.includes(l.url)) continue;
      chosen.push(l.url);
      n--;
    }
  };

  // Product first when identity is already settled, identity first otherwise —
  // whichever leads, both quotas are honoured before the leftovers are shared.
  if (input.identityStrong) {
    take(product, productQuota);
    take(identity, identityQuota);
  } else {
    take(identity, identityQuota);
    take(product, productQuota);
  }

  // ADAPTIVE: a quota the site cannot fill is not wasted. A shop with no
  // Impressum link gives its identity slot to a second product page, and a
  // brochure site with no product area gives its product slots to about/contact.
  if (chosen.length < budget) {
    take(product, budget - chosen.length);
    take(identity, budget - chosen.length);
    for (const u of input.guessedIdentityUrls ?? []) {
      if (chosen.length >= budget) break;
      if (!chosen.includes(u)) chosen.push(u);
    }
  }

  return {
    urls: chosen.slice(0, budget),
    // Only pay for a sitemap when the page itself offered no commercial area to
    // look at. A site with a working product menu never triggers this.
    needsSitemap: product.length === 0,
    identityQuota,
    productQuota,
    reason: input.identityStrong
      ? `Kimlik ana sayfadan doğrulandı — bütçe ürün keşfine kaydırıldı (${productQuota} ürün / ${identityQuota} kimlik).`
      : `Kimlik doğrulanamadı — önce kimlik sayfaları (${identityQuota} kimlik / ${productQuota} ürün).`,
  };
}

// ---------------------------------------------------------------------------
// Sitemaps
// ---------------------------------------------------------------------------

/** Image/video sitemaps list assets, not pages — following them buys nothing. */
const ASSET_SITEMAP_RE = /(image|video|news)[-_]?sitemap|sitemap[-_]?(image|video|news)/i;

export type SitemapParse = { urls: string[]; children: string[] };

/**
 * Read one sitemap document.
 *
 * A `<sitemapindex>` yields CHILDREN rather than URLs; the caller decides how
 * many to follow. Phase 1 deliberately refused to follow them at all because
 * the cost is unbounded — a large site nests dozens — and the result was that
 * esotiq.com, one of the two sites the sitemap fallback was written for, got
 * nothing. Following a bounded number is the middle ground.
 */
export function parseSitemap(xml: string): SitemapParse {
  const locs: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const v = (m[1] ?? "").trim();
    if (v) locs.push(v);
  }
  if (/<sitemapindex[\s>]/i.test(xml)) {
    return { urls: [], children: locs.filter((u) => !ASSET_SITEMAP_RE.test(u)) };
  }
  return { urls: locs, children: [] };
}

/** `Sitemap:` declarations in robots.txt — where a site that does not use the
 *  conventional /sitemap.xml path says where its sitemap actually is. */
export function parseRobotsSitemaps(txt: string): string[] {
  const out: string[] = [];
  for (const m of txt.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)) {
    const v = (m[1] ?? "").trim();
    if (v && !ASSET_SITEMAP_RE.test(v)) out.push(v);
  }
  return out;
}

/**
 * Turn sitemap URLs into a ranked, de-duplicated shortlist.
 *
 * The same scoring as page links, so a sitemap listing 40 000 URLs contributes
 * the handful that look commercial rather than its first N alphabetically.
 */
export function rankSitemapUrls(urls: string[], base: string, cap = 200): ScoredLink[] {
  const seen = new Set<string>();
  const links: RawLink[] = [];
  for (const u of urls) {
    if (links.length >= cap) break;
    if (!isCrawlableUrl(u, base)) continue;
    const canon = canonicalizeUrl(u, base);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    links.push({ url: u, anchor: "" });
  }
  return rankLinks(links);
}

/** Hard ceiling on sitemap exploration, so a huge site cannot turn one lead
 *  into a crawl. Deliberately small: this is a fallback, not a spider. */
export const SITEMAP_MAX_CHILDREN = 2;
export const SITEMAP_MAX_URLS = 2000;
