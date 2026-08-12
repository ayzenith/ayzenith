/**
 * Marketplace registry — the single source of truth for the external sales
 * channels a product can link out to ("Available On"). A product stores only a
 * URL per marketplace id; presentation (label, brand accent, order) lives here,
 * so adding or restyling a channel never touches product data or components.
 *
 * AYZENITH is NOT an e-commerce site: these are outbound links to official
 * marketplaces (B2C), kept clearly secondary to the B2B/wholesale path.
 */

export type MarketplaceId =
  | "trendyol"
  | "hepsiburada"
  | "amazon"
  | "pazarama"
  | "n11";

export type Marketplace = {
  readonly id: MarketplaceId;
  readonly label: string;
  /** Brand accent, used only as a small restrained dot on the outbound button. */
  readonly accent: string;
};

export const marketplaces: Record<MarketplaceId, Marketplace> = {
  trendyol: { id: "trendyol", label: "Trendyol", accent: "#F27A1A" },
  hepsiburada: { id: "hepsiburada", label: "Hepsiburada", accent: "#FF6000" },
  amazon: { id: "amazon", label: "Amazon", accent: "#FF9900" },
  pazarama: { id: "pazarama", label: "Pazarama", accent: "#7C3AED" },
  n11: { id: "n11", label: "n11", accent: "#E4002B" },
};

/** Canonical display order for outbound marketplace buttons. */
export const marketplaceOrder: readonly MarketplaceId[] = [
  "trendyol",
  "hepsiburada",
  "amazon",
  "pazarama",
  "n11",
];
