/**
 * AYZENITH LEAD FINDER — compiled defaults & shared vocabulary.
 *
 * The single source of truth for the module's constants: commercial-role and
 * size vocabulary, the deterministic scoring weights/thresholds, and the free-
 * source discovery hints (OpenStreetMap shop selectors + a small multilingual
 * search-term dictionary). Everything scoring-related is overridable at runtime
 * via the LeadSetting row (Admin → Lead Finder → Ayarlar); an empty settings
 * table means the values here are used verbatim.
 *
 * No discovered data lives here — only structure and configuration. Nothing in
 * this file is ever presented to the user as a fact about a real company; it only
 * shapes HOW the pipeline searches and scores.
 */

// ---------------------------------------------------------------------------
// Commercial roles (§5/§9). A firm may hold SEVERAL of these at once, so the
// company model stores them as an array. `models` marks which roles are the
// PRIORITY channel for each business model (§6) — used for the "role fit"
// score component, not to hide the others.
// ---------------------------------------------------------------------------

export type LeadRole =
  | "importer"
  | "distributor"
  | "wholesaler"
  | "sourcing"
  | "manufacturer"
  | "retailer"
  | "retail_chain"
  | "independent_store"
  | "boutique"
  | "specialty_store"
  | "department_store"
  | "ecommerce"
  | "marketplace_seller"
  | "other";

export const LEAD_ROLES: Array<{
  key: LeadRole;
  label: string;
  models: Array<"B2B" | "B2C">;
}> = [
  { key: "importer", label: "İthalatçı", models: ["B2B"] },
  { key: "distributor", label: "Distribütör", models: ["B2B"] },
  { key: "wholesaler", label: "Toptancı", models: ["B2B"] },
  { key: "sourcing", label: "Sourcing / Tedarik firması", models: ["B2B"] },
  { key: "manufacturer", label: "Üretici", models: ["B2B"] },
  { key: "retailer", label: "Perakendeci", models: ["B2C"] },
  { key: "retail_chain", label: "Mağaza zinciri", models: ["B2C"] },
  { key: "department_store", label: "Büyük mağaza", models: ["B2C"] },
  { key: "specialty_store", label: "Uzman mağaza", models: ["B2C"] },
  { key: "independent_store", label: "Bağımsız mağaza", models: ["B2C"] },
  { key: "boutique", label: "Butik", models: ["B2C"] },
  { key: "ecommerce", label: "E-ticaret", models: ["B2C", "B2B"] },
  { key: "marketplace_seller", label: "Marketplace satıcısı", models: ["B2C", "B2B"] },
  { key: "other", label: "Diğer ticari kanal", models: ["B2B", "B2C"] },
];

export const LEAD_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_ROLES.map((r) => [r.key, r.label]),
);

/** Priority roles for a business model (§6) — used by scoring's "role fit". */
export function priorityRoles(model: string): LeadRole[] {
  const m = model === "B2C" ? "B2C" : "B2B";
  return LEAD_ROLES.filter((r) => r.models.includes(m)).map((r) => r.key);
}

// ---------------------------------------------------------------------------
// Size + status + freshness display vocabulary.
// ---------------------------------------------------------------------------

export const SIZE_LABELS: Record<string, string> = {
  LARGE: "Büyük",
  MEDIUM: "Orta",
  SMALL: "Küçük",
  MICRO: "Mikro",
  ONLINE: "Online",
  UNKNOWN: "Bilinmiyor",
};

/** Product-fit ladder (§2). VERIFIED/LIKELY come from a real source check;
 *  UNCLEAR = a hint but no confirmation; NOT_RELEVANT = actively contradicted;
 *  UNVERIFIED = website not (yet) checked ("doğrulanamadı"), NOT a negative. */
export const PRODUCT_FIT_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  LIKELY: "Muhtemel",
  UNCLEAR: "Belirsiz",
  NOT_RELEVANT: "İlgisiz",
  UNVERIFIED: "Doğrulanamadı",
};

/** Detected business model of a company (§5) — from website signals, not the
 *  search input. Null when it could not be determined. */
export const DETECTED_MODEL_LABELS: Record<string, string> = {
  B2B: "B2B",
  B2C: "B2C",
  BOTH: "B2B + B2C",
};

/** Website reachability outcome (§1). NONE = no website known; UNREACHABLE = a
 *  website exists but could not be fetched (never read as "company inactive"). */
export const WEBSITE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  UNREACHABLE: "Ulaşılamadı",
  NONE: "Website yok",
};

export const STATUS_LABELS: Record<string, string> = {
  DISCOVERED: "Keşfedildi",
  SCREENING: "Eleniyor",
  QUALIFIED: "Nitelikli",
  HIGH_PRIORITY: "Yüksek öncelik",
  REJECTED: "Elendi",
  DUPLICATE: "Tekrar",
  INACTIVE: "Pasif",
  INSUFFICIENT_DATA: "Yetersiz veri",
  CONTACTED: "İletişime geçildi",
  REPLIED: "Yanıt alındı",
  MEETING: "Görüşme",
  QUOTATION: "Teklif",
  NEGOTIATION: "Müzakere",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
};

export const SIGNAL_STRENGTH_LABELS: Record<string, string> = {
  STRONG: "Güçlü",
  MEDIUM: "Orta",
  WEAK: "Zayıf",
  NONE: "Veri bulunamadı",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  OSM: "OpenStreetMap",
  OFFICIAL_WEBSITE: "Resmi website",
  PUBLIC_WEB: "Kamuya açık web",
  PUBLIC_BUSINESS_DIRECTORY: "Açık işletme rehberi",
  RADAR: "RADAR analizi",
  MANUAL: "Elle girildi",
  OTHER_FREE_SOURCE: "Diğer ücretsiz kaynak",
};

export const FRESHNESS_META: Record<string, { dot: string; label: string }> = {
  FRESH: { dot: "🟢", label: "Güncel" },
  RECHECK: { dot: "🟡", label: "Yeniden doğrulama gerekli" },
  STALE: { dot: "🔴", label: "Eski / doğrulanamadı" },
};

/**
 * How old a record is, derived from when it was last checked.
 *
 * The stored `freshness` column was only ever written as FRESH — nothing in the
 * codebase set RECHECK or STALE — so the data-health panel's amber and red
 * counters were structurally always zero and every card claimed "Güncel"
 * regardless of age. A system that shows the age of its data must let that age
 * advance, so freshness is computed from `lastCheckedAt` instead of stored.
 *
 * One re-check window means "due for re-verification"; two means the record is
 * old enough that it should not be relied on without a fresh look.
 */
export function freshnessFor(
  lastCheckedAt: Date,
  recheckDays: number = DEFAULT_RECHECK_DAYS,
  now: Date = new Date(),
): "FRESH" | "RECHECK" | "STALE" {
  const days = (now.getTime() - lastCheckedAt.getTime()) / 86_400_000;
  if (days <= recheckDays) return "FRESH";
  if (days <= recheckDays * 2) return "RECHECK";
  return "STALE";
}

// ---------------------------------------------------------------------------
// Deterministic scoring (§14). Weights sum to 100 and are the owner-approved V1
// defaults; they are overridable in LeadSetting and central here so tuning never
// means editing scoring code. Score bands (§14) live in thresholds.
// ---------------------------------------------------------------------------

// V2 deterministic criteria (§8). These replace the V1 set; existing companies
// keep the frozen breakdown they were scored with (labels below still cover the
// legacy keys so old rows render). Weights sum to 100 and are overridable.
export const LEAD_SCORE_COMPONENTS = [
  "productFit",
  "commercialRole",
  "companyQuality",
  "marketRelevance",
  "contactability",
  "dataConfidence",
] as const;

export type LeadScoreComponent = (typeof LEAD_SCORE_COMPONENTS)[number];

export type LeadWeights = Record<LeadScoreComponent, number>;

export const DEFAULT_LEAD_WEIGHTS: LeadWeights = {
  productFit: 30, // PRODUCT FIT
  commercialRole: 20, // COMMERCIAL ROLE
  companyQuality: 15, // COMPANY QUALITY (size/website/completeness)
  marketRelevance: 10, // MARKET RELEVANCE (country/city match)
  contactability: 15, // CONTACTABILITY (decision-maker + contact info)
  dataConfidence: 10, // DATA CONFIDENCE (how verified the data is)
};

/** Labels cover both the V2 keys and the legacy V1 keys, so a company scored
 *  under V1 still renders a readable breakdown. */
export const LEAD_COMPONENT_LABELS: Record<string, string> = {
  productFit: "Ürün Uyumu",
  commercialRole: "Ticari Rol",
  companyQuality: "Şirket Kalitesi",
  marketRelevance: "Pazar Uyumu",
  contactability: "Ulaşılabilirlik",
  dataConfidence: "Veri Güveni",
  // legacy V1 keys
  roleFit: "Ticari Rol Uyumu",
  activity: "Ticari Faaliyet Sinyali",
  market: "Pazar / Ülke Uyumu",
  size: "Şirket / İşletme Ölçeği",
  dataQuality: "Veri Kalitesi",
};

export type LeadThresholds = { strong: number; potential: number };

/** ≥ strong → güçlü aday; ≥ potential → potansiyel; below → düşük. */
export const DEFAULT_LEAD_THRESHOLDS: LeadThresholds = { strong: 80, potential: 60 };

/** How long a lead stays "fresh" before re-verification is recommended (§20). */
export const DEFAULT_RECHECK_DAYS = 30;

// ---------------------------------------------------------------------------
// Confidence model (§ accuracy Phase 4)
// ---------------------------------------------------------------------------

/**
 * How the four confidence dimensions combine into one number.
 *
 * THE MODEL, in one line:
 *
 *     core    = 0.6 × min(identity, product) + 0.4 × mean(identity, product)
 *     overall = core × (0.80 + 0.20 × coverage) × (0.90 + 0.10 × freshness)
 *
 * WHY THIS SHAPE, and not the two obvious alternatives — all three were run over
 * 1183 real leads before choosing:
 *
 *  • A plain `min()` across all four dimensions was rejected because it breaks
 *    the module's own rule that scarce data is not wrong data: a firm with
 *    perfect identity and product evidence reached by only one source scored 13.
 *    Under this model it scores 74.
 *  • A flat weighted average was rejected because it lets a strong dimension pay
 *    for a broken one: C&A on cunda.de — an unattributable site, the exact bug
 *    this whole audit exists to close — came out at 66, i.e. "fairly reliable".
 *    Under this model it scores 31.
 *
 * So IDENTITY and PRODUCT are the CORE: they decide whether the claim is even
 * right, and the weaker of the two dominates (0.6) without the pair collapsing
 * to it (0.4 on the mean). COVERAGE and FRESHNESS are RELIABILITY dimensions —
 * how much of the picture we saw and how recently — so they can only ever shave
 * a bounded amount off a sound core, never determine it.
 *
 * A dimension that was genuinely NOT MEASURED is excluded and the rest
 * re-normalise; it is never read as zero. Counting an unmeasured product
 * dimension as zero — the first draft of this model did — dropped 902 of 1183
 * real leads into the bottom band purely because their sites never mentioned the
 * searched product.
 */
export const CONFIDENCE_MODEL = {
  /** Weight on the WEAKER of identity/product. The higher this is, the less a
   *  strong dimension can compensate for a broken one. */
  coreWeakestWeight: 0.6,
  /** Weight on the mean of identity/product, so a single soft dimension does not
   *  collapse an otherwise well-evidenced lead. Must sum to 1 with the above. */
  coreMeanWeight: 0.4,
  /** Multiplier floor for coverage: at zero coverage the core keeps 80%. This is
   *  the number that enforces "scarce data ≠ wrong data". */
  coverageFloor: 0.80,
  /** Multiplier floor for freshness: fully stale evidence keeps 90%. Lower than
   *  coverage's effect on purpose — old evidence is still evidence. */
  freshnessFloor: 0.90,
  /**
   * Ceiling applied when identity came back MISMATCH.
   *
   * A site we can positively attribute to a DIFFERENT company cannot yield a
   * confident claim about this one, however good the product evidence on it is.
   * Without this the arithmetic alone would let Expert/tilly-gmbh.de (identity 10,
   * product 88) reach the mid-30s; this pins it lower and keeps it there.
   */
  mismatchCeiling: 30,
  /**
   * Denominator for coverage: the number of verification checks the pipeline can
   * run for a fully-reachable firm. Coverage is answered/this, so a firm with no
   * website scores low on coverage — which lowers CONFIDENCE (how sure we are)
   * and never the SCORE (how good the lead is).
   */
  maxChecks: 10,
} as const;

/** Freshness as a 0–1 multiplier input, from the existing three-state band. */
export const FRESHNESS_FACTOR: Record<"FRESH" | "RECHECK" | "STALE", number> = {
  FRESH: 1,
  RECHECK: 0.6,
  STALE: 0.3,
};

export type LeadBand =
  | "VERY_STRONG"
  | "STRONG"
  | "POTENTIAL"
  | "LOW"
  | "INSUFFICIENT_DATA";

/** Map a 0–100 score to a card band (colour + label on the card). */
export function scoreBand(score: number | null): LeadBand {
  if (score == null) return "INSUFFICIENT_DATA";
  if (score >= 90) return "VERY_STRONG";
  if (score >= 80) return "STRONG";
  if (score >= 60) return "POTENTIAL";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Lead priority (§9). Distinct, faithful 4-tier priority used across V2, plus a
// DATA_LIMITED flag surfaced next to the score when critical data is missing.
// ---------------------------------------------------------------------------

export type LeadPriority = "HIGH" | "MEDIUM" | "LOW" | "DO_NOT" | "DATA_LIMITED";

export function leadPriority(score: number | null): LeadPriority {
  if (score == null) return "DATA_LIMITED";
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "LOW";
  return "DO_NOT";
}

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  HIGH: "YÜKSEK ÖNCELİK",
  MEDIUM: "ORTA ÖNCELİK",
  LOW: "DÜŞÜK ÖNCELİK",
  DO_NOT: "ÖNCELİK DEĞİL",
  DATA_LIMITED: "VERİ SINIRLI",
};

// ---------------------------------------------------------------------------
// Commercial-model fit (§1/§5/§6/§7). The searched model (B2B/B2C) must be a
// REAL gate, not a soft signal. Roles split into: STRONG B2B evidence (a firm
// that supplies wholesale), B2B BUYER roles (retail that MIGHT buy wholesale —
// acceptable but never proof on its own), and B2C roles.
// ---------------------------------------------------------------------------

export const B2B_SUPPLIER_ROLES: LeadRole[] = ["importer", "distributor", "wholesaler", "sourcing", "manufacturer"];
/** The subset of supplier roles that, on their own, are STRONG enough to VERIFY a
 *  B2B supply channel (§3/§8). `manufacturer` is deliberately EXCLUDED: a maker
 *  label alone (an OSM tag or a stray "Hersteller" on a shop page) is not proof
 *  that the firm sells wholesale to businesses — it drops to POSSIBLE until a real
 *  wholesale/B2B signal corroborates it. */
export const B2B_STRONG_SUPPLIER_ROLES: LeadRole[] = ["importer", "distributor", "wholesaler", "sourcing"];
export const B2B_BUYER_ROLES: LeadRole[] = ["retail_chain", "department_store", "specialty_store", "independent_store", "boutique", "retailer"];
export const B2C_ROLES: LeadRole[] = ["retailer", "retail_chain", "department_store", "specialty_store", "independent_store", "boutique", "ecommerce", "marketplace_seller"];

/** Model-fit for the SEARCHED model.
 *  VERIFIED     — real, sourced evidence the firm fits the chosen model.
 *  POSSIBLE     — could fit (e.g. a store that might buy wholesale), unproven.
 *  NOT_SUITABLE — evidence it does NOT fit (e.g. B2C-only in a B2B search).
 *  UNVERIFIED   — not enough data (website not checked) — never read as negative. */
export type ModelFit = "VERIFIED" | "POSSIBLE" | "NOT_SUITABLE" | "UNVERIFIED";

export const MODEL_FIT_META: Record<ModelFit, { dot: string; label: string; fg: string; bg: string }> = {
  VERIFIED: { dot: "🟢", label: "Doğrulandı", fg: "#2f7a48", bg: "#eaf3ec" },
  POSSIBLE: { dot: "🟡", label: "Belirsiz", fg: "#8a6d1f", bg: "#f8f1dc" },
  NOT_SUITABLE: { dot: "🔴", label: "Uygun değil", fg: "#8a2b2b", bg: "#fbeaea" },
  UNVERIFIED: { dot: "⚪", label: "Doğrulanamadı", fg: "#5b5b5b", bg: "#f1f0ee" },
};

export function modelFitLabel(model: string, fit: string): string {
  const m = model === "B2C" ? "B2C" : "B2B";
  const meta = MODEL_FIT_META[(fit as ModelFit)] ?? MODEL_FIT_META.UNVERIFIED;
  return `${m} Uygunluğu: ${meta.label}`;
}

export const PRODUCT_TIER_LABELS: Record<string, string> = {
  STRONG: "Güçlü",
  MEDIUM: "Orta",
  WEAK: "Zayıf",
};

// ---------------------------------------------------------------------------
// GATED priority (§6). A high score ALONE is not enough for HIGH PRIORITY — the
// lead must also genuinely fit the searched model, have a verified/likely product
// match, an active website and a contact route. Missing data is never positive.
// ---------------------------------------------------------------------------

export type QualifyInput = {
  leadScore: number | null;
  modelFit: string | null; // ModelFit
  productFit: string; // LeadProductFit
  websiteStatus: string | null;
  hasContact: boolean; // decision-maker OR company email/phone
};

export function qualifiedPriority(q: QualifyInput): LeadPriority {
  if (q.leadScore == null) return "DATA_LIMITED";
  // A firm that does NOT fit the searched model can never be HIGH; it drops out.
  if (q.modelFit === "NOT_SUITABLE") return "DO_NOT";

  // HIGH requires WEB-CONFIRMED product evidence — productFit === "VERIFIED" only
  // (that value is set solely from a STRONG product term found on the firm's own
  // site). A merely "LIKELY" fit — a broad-category signal like electronics/audio,
  // or an unconfirmed OSM shop hint — is NOT enough for HIGH and caps at MEDIUM
  // (§2/§5/§7). This is what keeps a generic electronics store off HIGH in a
  // "kulaklık" search when only "elektronik/audio" appears, never "Kopfhörer".
  // V3.1: Also require modelFit === "VERIFIED" (not "POSSIBLE") — potential/uncertain
  // model fits (B2C retailer with weak B2B signal) do not reach HIGH.
  const productVerified = q.productFit === "VERIFIED";
  const modelOk = q.modelFit === "VERIFIED";
  const websiteOk = q.websiteStatus === "ACTIVE";

  // HIGH PRIORITY gate: strong score AND VERIFIED model fit AND verified product AND reachable.
  if (q.leadScore >= 80 && modelOk && productVerified && websiteOk && q.hasContact) return "HIGH";
  // Strong score but a critical dimension unverified → cap at MEDIUM, flag if the
  // product/model themselves are unverified (DATA LIMITED).
  if (q.leadScore >= 60) {
    if (q.productFit === "UNVERIFIED" || q.modelFit === "UNVERIFIED") return "DATA_LIMITED";
    return "MEDIUM";
  }
  if (q.leadScore >= 40) return "LOW";
  return "DO_NOT";
}

// ---------------------------------------------------------------------------
// Social media intelligence (§13–§29). Free + public only: we read the company's
// OWN website for links to its social profiles (link-on-own-site = verified
// ownership). Platform-internal metrics (followers, bio, last post) are NOT read
// (login-walled / paid) and are surfaced as "ölçülemedi".
// ---------------------------------------------------------------------------

export type SocialPlatform = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "x";

export const SOCIAL_PLATFORMS: Array<{ key: SocialPlatform; label: string; test: RegExp }> = [
  { key: "instagram", label: "Instagram", test: /(^|\.)instagram\.com\//i },
  { key: "facebook", label: "Facebook", test: /(^|\.)(facebook\.com|fb\.com)\//i },
  { key: "linkedin", label: "LinkedIn", test: /(^|\.)linkedin\.com\//i },
  { key: "tiktok", label: "TikTok", test: /(^|\.)tiktok\.com\//i },
  { key: "youtube", label: "YouTube", test: /(^|\.)(youtube\.com|youtu\.be)\//i },
  { key: "x", label: "X", test: /(^|\.)(twitter\.com|x\.com)\//i },
];

export const SOCIAL_MATCH_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  POSSIBLE: "Muhtemel",
  UNVERIFIED: "Doğrulanamadı",
};

// ---------------------------------------------------------------------------
// Countries. Reuses the same Turkish labels RADAR uses; kept as its own list so
// the two modules stay decoupled but consistent.
// ---------------------------------------------------------------------------

export { COUNTRY_LABELS } from "./radar";

/**
 * Major cities per market — used by OSM discovery when NO city is given (§ V2
 * discovery fix). A country-wide Overpass area query times out on the public
 * instance and returns an empty result with a server "remark", which must never
 * be read as "no leads". Instead we expand across a handful of major cities
 * (each a small, fast, reliable query) and aggregate. Names must match OSM's
 * administrative `name` tag exactly (e.g. "Frankfurt am Main", not "Frankfurt").
 * A country not listed here falls back to a single country-area attempt.
 */
export const MAJOR_CITIES: Record<string, string[]> = {
  DE: ["Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf", "Leipzig"],
  FR: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Strasbourg", "Bordeaux"],
  NL: ["Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen"],
  BE: ["Brussel", "Antwerpen", "Gent", "Charleroi", "Liège", "Brugge"],
  IT: ["Roma", "Milano", "Napoli", "Torino", "Palermo", "Bologna", "Firenze"],
  ES: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Málaga"],
  AT: ["Wien", "Graz", "Linz", "Salzburg", "Innsbruck"],
  PL: ["Warszawa", "Kraków", "Łódź", "Wrocław", "Poznań", "Gdańsk"],
  SE: ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
  DK: ["København", "Aarhus", "Odense", "Aalborg"],
  PT: ["Lisboa", "Porto", "Braga", "Coimbra"],
  CZ: ["Praha", "Brno", "Ostrava", "Plzeň"],
  CH: ["Zürich", "Genève", "Basel", "Bern", "Lausanne"],
};

/** How many cities to expand across for a country-wide search (bounds the number
 *  of Overpass calls so we stay within rate limits and the request budget). Kept
 *  small on purpose: the public Overpass instance rate-limits bursts, so fewer,
 *  reliable city queries beat many that trip 429s. */
export const CITY_EXPANSION_CAP = 4;

/** Total Overpass query budget for one search (targets × query-groups). Bounds
 *  the fan-out so query expansion stays broad in COVERAGE but sane in REQUESTS. */
export const MAX_DISCOVERY_QUERIES = 9;

/** German/English commercial-role name terms for the B2B discovery group — used
 *  to catch wholesalers/importers/distributors whose OSM name states it. Applied
 *  to shop names and company offices, never fabricated. */
export const B2B_NAME_TERMS = [
  "Großhandel", "Großhändler", "Grosshandel", "Import", "Importeur",
  "Distribution", "Vertrieb", "Fachhandel", "Fachhändler", "Wholesale",
];

// ---------------------------------------------------------------------------
// FREE discovery hints — OpenStreetMap shop/office selectors + a small
// multilingual keyword dictionary. This is the honest bridge between a natural-
// language product ("kadın iç giyim") and (a) OSM `shop=*` values to query and
// (b) local-language terms used to VERIFY product fit against a site later.
//
// IMPORTANT: matching a keyword only WIDENS the search. It never asserts an HS
// code or a product fit — fit is verified separately against a real source (§4).
// A product with no dictionary entry still works: it falls back to broad retail
// selectors and is marked productFit=UNVERIFIED until a source confirms it.
// ---------------------------------------------------------------------------

export type ProductProfile = {
  /** OSM shop/office tag values to query for physical/e-commerce discovery. */
  osmShops: string[];
  /** OSM shop tags that are THEMSELVES specific product evidence (e.g. "lingerie"
   *  for lingerie). A broad tag like "clothes" is NOT here — it is only WEAK. */
  specificShops?: string[];
  /** Local-language product terms (for website verification + name matching). */
  terms: { en: string[]; de: string[]; tr: string[] };
  /** Tiered product-fit signals (§2). A STRONG term on a real source → VERIFIED;
   *  a MEDIUM term → LIKELY; anything else (generic fashion/clothes) → WEAK →
   *  never "Doğrulandı". */
  signals?: { strong: string[]; medium: string[] };
  /** True when the product is primarily sold via services, not shops (e.g.
   *  dental implants) — Lead Finder flags weaker OSM coverage honestly. */
  serviceOriented?: boolean;
};

/** Broad retail fallback when a product isn't in the dictionary. */
export const FALLBACK_OSM_SHOPS = [
  "department_store",
  "general",
  "variety_store",
  "trade",
  "wholesale",
];

/**
 * Curated product → discovery profile. Deliberately small and human-owned (like
 * RADAR's HS table) — it is safe to grow, and getting an entry wrong only widens
 * or narrows a search, never fabricates a result.
 */
export const PRODUCT_PROFILES: Array<{ match: string[]; profile: ProductProfile }> = [
  {
    match: ["kadin ic giyim", "ic giyim", "lingerie", "corap", "damenunterwasche", "dessous"],
    profile: {
      osmShops: ["lingerie", "clothes", "fashion", "boutique"],
      specificShops: ["lingerie"],
      terms: {
        en: ["women's underwear", "lingerie", "intimates", "underwear", "lingerie shop"],
        de: ["Dessous", "Lingerie", "Damenwäsche", "Damenunterwäsche", "Unterwäsche", "Wäschegeschäft", "Dessousgeschäft", "Damenmode"],
        tr: ["kadın iç giyim", "iç giyim", "lingerie mağazası"],
      },
      // V3.2: bare "unterwäsche"/"underwear" are the GENERIC PARENT category and
      // are demoted to MEDIUM. Two independent Berlin sites proved they do not
      // discriminate: daemmisol.de (building materials) and schulzeshop.com
      // (Textildruck Großhandel) both list "Unterwäsche" purely as a WORKWEAR/PPE
      // catalogue entry next to Gummistiefel/Socken/Gehörschutz. Only the
      // gender- or category-specific words are strong enough to VERIFY.
      signals: {
        strong: ["lingerie", "dessous", "damenunterwäsche", "damenwäsche", "dessousgeschäft", "lingeriegeschäft", "women's underwear", "womens underwear", "intimates", "nachtwäsche"],
        medium: ["unterwäsche", "underwear", "bh", "bralette", "slip", "korsett", "bikini", "bademode", "shapewear"],
      },
    },
  },
  {
    match: ["kablosuz kulaklik", "kulaklik", "headphone", "earphone", "kopfhorer"],
    profile: {
      osmShops: ["electronics", "hifi", "mobile_phone", "computer"],
      specificShops: ["hifi"],
      terms: {
        en: ["wireless headphones", "earphones", "headset", "audio retailer", "consumer electronics distributor"],
        de: ["kabellose Kopfhörer", "Kopfhörer", "Headset", "Elektronikfachhandel", "Elektronik Großhandel"],
        tr: ["kablosuz kulaklık", "kulaklık", "kulakiçi kulaklık"],
      },
      signals: {
        strong: ["kopfhörer", "headphone", "headphones", "earphone", "earphones", "headset", "kulaklık", "in-ear", "over-ear", "ohrhörer"],
        medium: ["audio", "hifi", "hi-fi", "lautsprecher", "speaker", "bluetooth", "elektronik", "electronics"],
      },
    },
  },
  {
    match: ["akilli saat", "smartwatch", "smart watch", "smartwatch"],
    profile: {
      osmShops: ["electronics", "watches", "mobile_phone", "computer"],
      terms: {
        en: ["smartwatch", "smart watch", "wearable", "electronics retailer"],
        de: ["Smartwatch", "Smartuhr", "Wearable", "Elektronikhandel"],
        tr: ["akıllı saat", "akıllı bileklik"],
      },
    },
  },
  {
    match: ["dental implant", "implant", "dis implant", "zahnimplantat"],
    profile: {
      serviceOriented: true,
      osmShops: ["medical_supply"],
      terms: {
        en: ["dental implant", "dental supplier", "dental distributor", "dental laboratory", "dental depot"],
        de: ["Zahnimplantat", "Dentaldepot", "Dentalhandel", "Dentallabor", "zahnärztlicher Bedarf"],
        tr: ["dental implant", "diş implantı", "dental depo"],
      },
    },
  },
  {
    match: ["tisort", "t-shirt", "pamuklu", "tekstil", "textile", "clothing", "giyim"],
    profile: {
      osmShops: ["clothes", "fashion", "boutique", "fabric"],
      terms: {
        en: ["t-shirt", "cotton apparel", "clothing retailer", "textile wholesaler", "apparel distributor"],
        de: ["T-Shirt", "Baumwollbekleidung", "Bekleidungsgeschäft", "Textilgroßhandel"],
        tr: ["tişört", "pamuklu tişört", "giyim mağazası"],
      },
    },
  },
  {
    match: ["mutfak", "kitchen", "houseware", "ev mutfak", "kuche"],
    profile: {
      osmShops: ["houseware", "kitchen", "hardware", "appliance"],
      terms: {
        en: ["kitchenware", "kitchen equipment", "commercial kitchen"],
        de: ["Küchenbedarf", "Küchengeschäft"],
        tr: ["mutfak eşyası", "mutfak ekipmanı"],
      },
      signals: {
        // "gastronomie" alone is NOT strong: it is the sector, not the product —
        // a restaurant, a caterer or a food blog all carry it. Only the compounds
        // that name commercial kitchen EQUIPMENT verify the product (§V3.3).
        strong: ["großküchentechnik", "großküchenausstattung", "gastronomiebedarf", "gastronomiegeräte", "professionelle küchentechnik", "restaurantbedarf", "gewerbeküchen", "großküchen", "kombidämpfer", "gewerbekühlschrank", "spültechnik", "commercial kitchen equipment", "professional kitchen equipment"],
        medium: ["gastronomie", "küchenbedarf", "küchenausstattung", "küchenzubehör", "küchengeschäft", "kitchenware", "catering equipment", "cateringbedarf"],
      },
    },
  },
];

/** Strip Turkish diacritics + lowercase, mirroring RADAR's normaliser so product
 *  matching behaves identically across the two modules. */
export function normalizeProduct(s: string): string {
  return (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary substring test for two `normalizeProduct()`-normalized strings
 *  (both are plain a-z0-9 + single spaces, so padding with spaces is a safe,
 *  cheap boundary check). Unlike plain `.includes()`, a 3-letter term like "bh"
 *  no longer matches inside an unrelated longer word, and a multi-word term
 *  ("women's underwear" → "women s underwear") only matches on its own word
 *  boundaries. Used wherever a curated product term decides productFit, since a
 *  false substring hit there can ride all the way to "VERIFIED". */
export function includesProductTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  return ` ${haystack} `.includes(` ${term} `);
}

/**
 * Words that name an industry, a material or a shape of business rather than a
 * product a firm can be shown to SELL. On their own they discriminate nothing: a
 * steel stockist, a firm that fits steel-framed windows and a firm that merely
 * mentions steel in its company profile all carry the word "steel".
 *
 * The list only ever DEMOTES a term. It never rejects a firm, and a generic word
 * sitting next to a specific one changes nothing about the specific one.
 */
export const GENERIC_PRODUCT_WORDS = new Set([
  // material / industry
  "cam", "glass", "celik", "steel", "stahl", "metal", "eisen", "iron", "alu", "aluminium",
  "plastik", "plastic", "kunststoff", "ahsap", "wood", "holz", "beton", "concrete",
  "tekstil", "textile", "textil", "kumas", "fabric", "kagit", "paper", "papier",
  "kimya", "chemie", "chemical", "gida", "food", "lebensmittel", "getranke", "beverage",
  // shape of business / catch-alls
  "sistem", "system", "systeme", "makine", "machine", "maschine", "maschinen",
  "ekipman", "equipment", "ausrustung", "urun", "product", "produkt", "produkte",
  "ticaret", "trade", "handel", "hizmet", "service", "dienstleistung",
  "cozum", "solution", "losung", "teknoloji", "technology", "technik",
  "malzeme", "material", "sanayi", "industrie", "industry", "industrial", "endustriyel",
  "parca", "part", "teile", "aksesuar", "accessory", "zubehor",
  "ithalat", "import", "ihracat", "export", "toptan", "wholesale", "grosshandel",
]);

/**
 * Turn a product query we have NO curated profile for into product-fit signals.
 *
 * This was the single highest-impact false-positive source in the module. The
 * previous `withSignals` fallback put the user's RAW QUERY straight into the
 * STRONG tier, and one STRONG term matched anywhere outside boilerplate is the
 * only thing that sets productFit = "VERIFIED". So a one-word search — "cam",
 * "çelik", "sistem" — verified every firm whose site happened to contain that
 * word. Measured on live data: the "akıllı gözlük" search returned 162 firms
 * whose top scorers were a scrap-metal dealer, a tile wholesaler and a builders'
 * merchant, every one of them at score 83.
 *
 * The rule now:
 *   • A multi-word query is a PHRASE, and a phrase is specific enough to verify:
 *     "akilli gozluk" printed on a page is a real product claim.
 *   • A single word is NEVER strong — at best it supports "LIKELY".
 *   • A single GENERIC word supports nothing beyond the unranked generic-term
 *     bucket, whose ceiling is already "UNCLEAR".
 *
 * The phrase's own specific words stay as MEDIUM signals, so a genuine partial
 * match still counts: precision rises without recall collapsing.
 */
export function tierUncuratedQuery(productQuery: string): { strong: string[]; medium: string[] } {
  const norm = normalizeProduct(productQuery);
  if (!norm) return { strong: [], medium: [] };
  const tokens = norm.split(" ").filter((t) => t.length >= 3);
  const specific = tokens.filter((t) => !GENERIC_PRODUCT_WORDS.has(t));
  if (tokens.length >= 2) return { strong: [norm], medium: specific };
  return { strong: [], medium: specific };
}

/** Ensure a CURATED profile always carries product-fit signals: if none were
 *  hand-written, derive STRONG signals from its local-language terms. Safe here
 *  and only here — a curated profile's `terms` are real, specific product words
 *  chosen by a human. The uncurated fallback must NOT go through this; it uses
 *  `tierUncuratedQuery` above. */
function withSignals(p: ProductProfile): ProductProfile {
  if (p.signals) return p;
  const strong = Array.from(
    new Set([...p.terms.de, ...p.terms.en, ...p.terms.tr].map((t) => t.toLocaleLowerCase("de")).filter((t) => t.length >= 4)),
  );
  return { ...p, signals: { strong, medium: [] } };
}

export function resolveProductProfile(productQuery: string): {
  profile: ProductProfile;
  matched: boolean;
} {
  const norm = normalizeProduct(productQuery);
  for (const entry of PRODUCT_PROFILES) {
    if (entry.match.some((m) => norm.includes(normalizeProduct(m)))) {
      return { profile: withSignals(entry.profile), matched: true };
    }
  }
  // UNCURATED. The query is whatever the user typed, so its signals are tiered
  // by specificity rather than trusted wholesale (§ accuracy audit).
  const q = productQuery.trim();
  return {
    profile: {
      osmShops: FALLBACK_OSM_SHOPS,
      terms: { en: [q], de: [q], tr: [q] },
      signals: tierUncuratedQuery(q),
    },
    matched: false,
  };
}
