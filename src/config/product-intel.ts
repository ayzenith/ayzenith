/**
 * AYZENITH PRODUCT INTELLIGENCE — marketplace rules as DATA, not code.
 *
 * Title limits and banned wording change whenever a marketplace feels like it.
 * Keeping them in a table means that change is an edit here, not a rewrite of
 * the title validator. Every value below is a DEFAULT the operator can correct;
 * the UI says so rather than presenting them as the marketplace's own truth.
 */

export type CommissionBase = "GROSS" | "NET";

export type MarketplaceMeta = {
  key: string;
  label: string;
  /** Title character ceiling. A default, shown as editable in the UI. */
  titleMaxChars: number;
  /** Is commission charged on the VAT-inclusive price, or on the net? This
   *  single choice moves the break-even price by several percent, so it is
   *  declared per marketplace instead of being assumed once in the formula. */
  commissionBase: CommissionBase;
  note: string;
};

export const MARKETPLACES: MarketplaceMeta[] = [
  { key: "TRENDYOL", label: "Trendyol", titleMaxChars: 100, commissionBase: "GROSS", note: "Komisyon KDV dahil fiyat üzerinden varsayıldı." },
  { key: "HEPSIBURADA", label: "Hepsiburada", titleMaxChars: 100, commissionBase: "GROSS", note: "Komisyon KDV dahil fiyat üzerinden varsayıldı." },
  { key: "AMAZON_TR", label: "Amazon TR", titleMaxChars: 200, commissionBase: "GROSS", note: "Komisyon KDV dahil fiyat üzerinden varsayıldı." },
  { key: "N11", label: "n11", titleMaxChars: 100, commissionBase: "GROSS", note: "Komisyon KDV dahil fiyat üzerinden varsayıldı." },
  { key: "CICEKSEPETI", label: "Çiçeksepeti", titleMaxChars: 100, commissionBase: "GROSS", note: "Komisyon KDV dahil fiyat üzerinden varsayıldı." },
  { key: "ETSY", label: "Etsy", titleMaxChars: 140, commissionBase: "GROSS", note: "Komisyon brüt tutar üzerinden varsayıldı." },
  { key: "EBAY", label: "eBay", titleMaxChars: 80, commissionBase: "GROSS", note: "Komisyon brüt tutar üzerinden varsayıldı." },
  { key: "OTHER", label: "Diğer", titleMaxChars: 120, commissionBase: "GROSS", note: "Genel varsayılan." },
];

export function marketplaceMeta(key: string): MarketplaceMeta {
  return MARKETPLACES.find((m) => m.key === key) ?? MARKETPLACES[MARKETPLACES.length - 1]!;
}

/**
 * Wording marketplaces routinely reject, plus claims nobody can substantiate
 * from a product's own attributes. Matched against NORMALIZED text, so no
 * diacritics and no punctuation here.
 */
export const BANNED_TITLE_PHRASES: string[] = [
  "en ucuz", "en iyi", "en kaliteli", "bir numara", "kampanyali", "indirimli", "ucretsiz kargo",
  "orjinal", "orijinal", "garantili", "birebir", "kopya", "replika", "sifir", "outlet",
  "dunyanin en", "turkiye nin en", "no 1", "best seller", "cok satan",
];

/** Below this many READABLE observations a coverage figure is not reported. */
export const MIN_FACET_SAMPLE = 8;

/** Below this many usable offers the whole analysis is INSUFFICIENT_DATA. */
export const MIN_OFFERS_FOR_MARKET = 5;

export const DEFAULT_TARGET_MARGIN_PCT = 25;
export const DEFAULT_RETURN_RATE_PCT = 5;
