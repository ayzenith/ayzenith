import type { Availability, ProductBadge } from "@/config/products";
import type { ProductStatusValue } from "@/config/product-admin";

/**
 * Static option lists for the product editor (client-safe — no server imports).
 * Category keys mirror the public i18n `products.categories.*` entries so a
 * product's category resolves to the same translated label on the site. Full
 * Category management (custom categories) arrives in a later batch.
 */

export type Option<T extends string> = { value: T; label: string };

export const CATEGORY_OPTIONS: readonly Option<string>[] = [
  { value: "electronics", label: "Tüketici Elektroniği" },
  { value: "smart", label: "Akıllı Cihazlar" },
  { value: "mobile", label: "Mobil Aksesuarlar" },
  { value: "home", label: "Ev ve Mutfak Ekipmanları" },
  { value: "textile", label: "Tekstil Ürünleri" },
  { value: "medical", label: "Medikal Ürünler" },
  { value: "dental", label: "Diş İmplant Sistemleri" },
];

export const STATUS_OPTIONS: readonly Option<ProductStatusValue>[] = [
  { value: "DRAFT", label: "Taslak" },
  { value: "PUBLISHED", label: "Yayında" },
  { value: "HIDDEN", label: "Gizli" },
];

export const AVAILABILITY_OPTIONS: readonly Option<Availability>[] = [
  { value: "in-stock", label: "Stokta" },
  { value: "limited", label: "Sınırlı" },
  { value: "coming-soon", label: "Yakında" },
];

export const BADGE_OPTIONS: readonly Option<ProductBadge | "">[] = [
  { value: "", label: "Rozet yok" },
  { value: "new", label: "Yeni" },
  { value: "bestseller", label: "Çok satan" },
  { value: "featured", label: "Öne çıkan" },
];

/** Marketplace channels an editor can paste a URL for. Order = display order. */
export const MARKETPLACE_FIELDS: readonly Option<
  "trendyol" | "hepsiburada" | "amazon" | "pazarama" | "n11"
>[] = [
  { value: "trendyol", label: "Trendyol" },
  { value: "hepsiburada", label: "Hepsiburada" },
  { value: "amazon", label: "Amazon" },
  { value: "pazarama", label: "Pazarama" },
  { value: "n11", label: "n11" },
];

/** Turkish label for a status value (used in the list badges). */
export const STATUS_LABEL: Record<ProductStatusValue, string> = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  HIDDEN: "Gizli",
};
