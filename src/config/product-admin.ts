import type {
  Availability,
  Localized,
  ProductBadge,
} from "@/config/products";
import type { MarketplaceId } from "@/config/marketplaces";

/**
 * Admin-facing product TYPES — shared by the client editor form and the
 * server-only repository. Kept free of any server import so it is safe to pull
 * into Client Components.
 */

export type ProductStatusValue = "DRAFT" | "PUBLISHED" | "HIDDEN";

/** The editable, admin-facing shape of a product (JSON fields fully typed). */
export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  categoryKey: string;
  status: ProductStatusValue;
  featured: boolean;
  availability: Availability;
  badge: ProductBadge | null;
  image: string | null;
  sortOrder: number;
  gallery: string[];
  shortDescription: Localized<string>;
  description: Localized<string>;
  features: Localized<string[]>;
  useCases: Localized<string[]>;
  specs: { label: Localized<string>; value: string }[];
  marketplaces: Partial<Record<MarketplaceId, string>>;
  downloads: { label: Localized<string>; href: string }[];
  createdAt: Date;
  updatedAt: Date;
};

/** Everything an editor can set — no id, no timestamps, no computed order. */
export type ProductWriteInput = Omit<
  AdminProduct,
  "id" | "sortOrder" | "createdAt" | "updatedAt"
>;
