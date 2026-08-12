import type { Locale } from "@/i18n/routing";
import type { MarketplaceId } from "@/config/marketplaces";

/**
 * Product catalogue — TYPES + client-safe helpers (the "integration contract").
 *
 * ARCHITECTURE (CMS): the `Product` shape below is the contract every product
 * component consumes. The DATA now lives in the database; the accessor functions
 * (`getActiveProducts`, `getProductBySlug`, …) live in the server-only
 * repository `src/server/products.ts` and are the single boundary where the CMS
 * reads and writes products. This file stays free of any server-only import so
 * it can be shared by both Server and Client components (e.g. `pick`, `Product`).
 *
 * This is a premium SHOWCASE, not a store: no prices, no cart, no checkout.
 * B2C buyers are routed to official marketplaces; B2B buyers to /contact.
 */

/** A value provided in every supported locale. CMS delivers the same shape. */
export type Localized<T> = Record<Locale, T>;

export type ProductBadge = "new" | "bestseller" | "featured";
export type Availability = "in-stock" | "limited" | "coming-soon";

export type ProductSpec = {
  /** Localized row label, e.g. "Power output". */
  readonly label: Localized<string>;
  /** Language-neutral value, e.g. "140 W". */
  readonly value: string;
};

export type ProductDownload = {
  readonly label: Localized<string>;
  /** Path/URL to the asset (future PDF support). */
  readonly href: string;
};

export type Product = {
  readonly slug: string;
  /** Brand/product name — language-neutral. */
  readonly name: string;
  /** Ties to an existing `products.categories.<key>` i18n entry. */
  readonly categoryKey: string;
  /** Primary image under /public (e.g. "/products/anker-prime-140w/main.jpg") or null → on-brand placeholder. */
  readonly image: string | null;
  /** Additional gallery images (paths under /public). */
  readonly gallery: readonly string[];
  readonly badge?: ProductBadge;
  readonly availability: Availability;
  /** Surfaced in the showcase's featured strip. */
  readonly featured: boolean;
  /** Hidden everywhere when false (soft delete / draft). */
  readonly active: boolean;
  readonly shortDescription: Localized<string>;
  readonly description: Localized<string>;
  readonly features: Localized<readonly string[]>;
  readonly useCases: Localized<readonly string[]>;
  readonly specs: readonly ProductSpec[];
  /** Marketplace id → outbound product URL. Only configured channels render. */
  readonly marketplaces: Partial<Record<MarketplaceId, string>>;
  readonly downloads?: readonly ProductDownload[];
};

/** Resolve a localized field for a given locale. */
export function pick<T>(value: Localized<T>, locale: Locale): T {
  return value[locale];
}
