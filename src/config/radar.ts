/**
 * AYZENITH RADAR — compiled defaults & shared vocabulary.
 *
 * This is the single source of truth for the scoring engine's constants and the
 * category/region vocabulary. Everything here is overridable at runtime via the
 * RadarSetting row (Admin → Radar → Ayarlar); an empty settings table means the
 * values below are used verbatim. Changing a weight here (or in settings) only
 * affects FUTURE analyses — every snapshot freezes the weights it was scored
 * with, so history never silently rewrites.
 *
 * No trade data, no scores, and no HS codes live in this file — only structure
 * and configuration. The HS-6 mappings are curated separately (radar-hs-seed.ts)
 * and owned in the database so the owner can edit them.
 */

/** The five scoring criteria. Keys are stable identifiers used across the engine,
 *  the snapshot JSON and the UI. Do NOT rename without a migration of snapshots. */
export const RADAR_CRITERIA = [
  "demand",
  "growth",
  "supplyAdvantage",
  "entry",
  "competition",
] as const;

export type RadarCriterionKey = (typeof RADAR_CRITERIA)[number];

/** Weights sum to 100. These are the owner-approved V1 weights. */
export type RadarWeights = Record<RadarCriterionKey, number>;

export const DEFAULT_WEIGHTS: RadarWeights = {
  demand: 30,
  growth: 20,
  supplyAdvantage: 25,
  entry: 15,
  competition: 10,
};

/**
 * Business model (V1.1). The analysis can be read from a wholesale/distribution
 * (B2B) or a consumer-market (B2C) perspective. Both use the SAME five verified
 * trade criteria and the SAME 0–100 architecture — only the *weighting* and the
 * *framing* change, so nothing is invented.
 *
 * HONESTY NOTE: consumer-specific signals (per-capita income, e-commerce
 * penetration, population, online-shopping behaviour) are NOT yet wired as data
 * providers. Rather than fabricate them, B2C re-weights the same sourced import /
 * export / concentration signals from a consumer-market lens (market size and
 * growth and competition matter more; TR supply route and entry burden matter a
 * little less) and the UI explicitly lists which consumer signals are unmeasured.
 */
export type BusinessModel = "B2B" | "B2C";

export const BUSINESS_MODELS: Array<{ key: BusinessModel; label: string; hint: string }> = [
  { key: "B2B", label: "B2B", hint: "Toptan / distribütörlük — ithalat ve tedarik yapısı önceliklidir." },
  { key: "B2C", label: "B2C", hint: "Tüketici pazarı — pazar büyüklüğü, büyüme ve rekabet önceliklidir." },
];

/** B2C weight profile over the SAME five criteria (sums to 100). */
export const B2C_WEIGHTS: RadarWeights = {
  demand: 30,
  growth: 25,
  supplyAdvantage: 20,
  entry: 10,
  competition: 15,
};

/** Consumer signals the V1.1 B2C model does NOT yet measure — surfaced verbatim
 *  in the UI so a B2C read never pretends to know consumer demand it can't see. */
export const B2C_UNMEASURED_SIGNALS: string[] = [
  "Kişi başına gelir / satın alma gücü",
  "E-ticaret penetrasyonu",
  "Nüfus / potansiyel müşteri tabanı",
  "Online alışveriş davranışı",
];

/** Resolve the weight profile for a business model, honouring runtime settings
 *  (B2B stays owner-configurable; B2C uses the fixed consumer profile in V1.1). */
export function weightsForModel(model: string, b2bWeights: RadarWeights): RadarWeights {
  return model === "B2C" ? B2C_WEIGHTS : b2bWeights;
}

/**
 * Source-concentration bands from a Herfindahl index (0–1). These name what the
 * competition criterion measures so "many countries" is never confused with
 * "the market is genuinely dispersed".
 */
export function concentrationBand(hhi: number): { key: "low" | "medium" | "high"; label: string } {
  if (hhi >= 0.25) return { key: "high", label: "Yüksek yoğunlaşma" };
  if (hhi >= 0.15) return { key: "medium", label: "Orta yoğunlaşma" };
  return { key: "low", label: "Düşük yoğunlaşma" };
}

/** A year-over-year or CAGR move beyond this magnitude (%) is flagged as an
 *  anomaly to be checked (data/year mismatch), never auto-read as a great signal. */
export const ANOMALY_CAGR_PCT = 80;

/** Decision-band cut-offs. A score ≥ worth → "araştırmaya değer"; ≥ monitor →
 *  "izlenmeli"; below → "öncelik değil". Insufficient-data is handled upstream. */
export type RadarThresholds = { worth: number; monitor: number };

export const DEFAULT_THRESHOLDS: RadarThresholds = { worth: 80, monitor: 60 };

/** How long a raw API response stays fresh before a re-fetch is allowed. Comtrade
 *  is rate-limited, so this protects the daily call budget. */
export const DEFAULT_CACHE_TTL_DAYS = 30;

/** Minimum score delta between two consecutive snapshots that raises a watch
 *  alert (±5 by owner decision). */
export const DEFAULT_ALERT_THRESHOLD = 5;

/** Certification / regulatory burden per category, used (inversely) by the
 *  "entry" criterion. This is deliberately a small human-curated table — NOT an
 *  AI guess — because getting it wrong silently corrupts the score. Editable in
 *  settings. Medical/dental carry the heaviest burden (MDR/CE for medical
 *  devices); textile the lightest. */
export type CertificationBurden = "low" | "medium" | "high" | "very-high";

export const DEFAULT_CERTIFICATION_BURDEN: Record<string, CertificationBurden> = {
  "consumer-electronics": "medium",
  "smart-devices": "medium",
  "mobile-accessories": "low",
  "home-kitchen": "medium",
  textile: "low",
  medical: "very-high",
  "dental-implants": "very-high",
};

/** Numeric burden → penalty (0 = no penalty, 1 = maximum). Consumed by scoring. */
export const CERTIFICATION_PENALTY: Record<CertificationBurden, number> = {
  low: 0.1,
  medium: 0.35,
  high: 0.65,
  "very-high": 0.9,
};

/**
 * The seven launch categories, in owner order. `key` matches RadarHsMapping and
 * the certification table; `label` is the Turkish display name. New categories
 * are added by seeding HS mappings under a new key — nothing here is a hard gate.
 */
export const RADAR_CATEGORIES = [
  { key: "consumer-electronics", label: "Tüketici Elektroniği" },
  { key: "smart-devices", label: "Akıllı Cihazlar" },
  { key: "mobile-accessories", label: "Mobil Aksesuarlar" },
  { key: "home-kitchen", label: "Ev & Mutfak" },
  { key: "textile", label: "Tekstil" },
  { key: "medical", label: "Medikal Ürünler" },
  { key: "dental-implants", label: "Dental İmplant Sistemleri" },
] as const;

export type RadarCategoryKey = (typeof RADAR_CATEGORIES)[number]["key"];

/**
 * Region → member country ISO-3166 alpha-2 codes. A region analysis scores every
 * member and compares them; a single-country analysis normalises the country
 * against the region it belongs to (so "Almanya" is judged against its European
 * peers, not in a vacuum). Editable in settings.
 */
export const DEFAULT_REGIONS: Record<string, { label: string; countries: string[] }> = {
  europe: {
    label: "Avrupa",
    countries: [
      "DE", "FR", "NL", "BE", "IT", "ES", "PL", "SE", "AT",
      "DK", "FI", "PT", "CZ", "RO", "GR", "HU", "IE",
    ],
  },
  benelux: { label: "Benelux", countries: ["NL", "BE", "LU"] },
  dach: { label: "DACH (Almanya · Avusturya · İsviçre)", countries: ["DE", "AT", "CH"] },
  nordics: { label: "İskandinavya", countries: ["SE", "DK", "FI", "NO"] },
};

/** Countries that trade with the EU under the Customs Union / FTAs where Turkish
 *  industrial goods enter duty-free — a real, measurable supply advantage. Used
 *  as a small bonus in the "supplyAdvantage" criterion. EU members here. */
export const EU_DUTY_FREE_FOR_TR: ReadonlySet<string> = new Set([
  "DE", "FR", "NL", "BE", "IT", "ES", "PL", "SE", "AT", "DK",
  "FI", "PT", "CZ", "RO", "GR", "HU", "IE", "LU", "SK", "SI",
  "BG", "HR", "EE", "LV", "LT", "CY", "MT",
]);

/** A friendly Turkish label for each criterion, for the UI + AI prompt context. */
export const CRITERION_LABELS: Record<RadarCriterionKey, string> = {
  demand: "Pazar Büyüklüğü & İthalat Aktivitesi",
  growth: "Büyüme Trendi",
  supplyAdvantage: "Türkiye Tedarik Avantajı",
  entry: "Giriş Kolaylığı",
  competition: "Rekabet Boşluğu",
};

/** ISO alpha-2 → Turkish country label for the common markets we analyse. */
export const COUNTRY_LABELS: Record<string, string> = {
  DE: "Almanya", FR: "Fransa", NL: "Hollanda", BE: "Belçika", IT: "İtalya",
  ES: "İspanya", PL: "Polonya", SE: "İsveç", AT: "Avusturya", DK: "Danimarka",
  FI: "Finlandiya", PT: "Portekiz", CZ: "Çekya", RO: "Romanya", GR: "Yunanistan",
  HU: "Macaristan", IE: "İrlanda", LU: "Lüksemburg", CH: "İsviçre", NO: "Norveç",
  SK: "Slovakya", SI: "Slovenya", BG: "Bulgaristan", HR: "Hırvatistan",
  EE: "Estonya", LV: "Letonya", LT: "Litvanya", CY: "Kıbrıs", MT: "Malta",
};
