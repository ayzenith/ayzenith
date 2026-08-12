import "server-only";

import type { Prisma, Product as ProductRow } from "@prisma/client";
import { db as prisma } from "@/lib/db";
import type {
  Availability,
  Localized,
  Product,
  ProductBadge,
} from "@/config/products";
import type {
  AdminProduct,
  ProductStatusValue,
  ProductWriteInput,
} from "@/config/product-admin";

export type {
  AdminProduct,
  ProductStatusValue,
  ProductWriteInput,
} from "@/config/product-admin";

/**
 * Product repository — the ONLY place that reads or writes products.
 *
 * Public pages call the `getActive*` / `getProduct*` accessors (which return the
 * exact `Product` shape the components already consume). The CMS calls the
 * `admin*` / mutation functions. Nothing else touches Prisma for products, so
 * the storage shape (JSON columns for localized data) never leaks into the UI.
 */

/* ── Empty localized helpers (used for defaults / new products) ───────────── */
const EMPTY_TEXT: Localized<string> = { en: "", tr: "", de: "" };
const EMPTY_LIST: Localized<string[]> = { en: [], tr: [], de: [] };

/* ── JSON casting helpers (we own every write, so casts are safe) ─────────── */
function asText(v: Prisma.JsonValue | null | undefined): Localized<string> {
  return (v as unknown as Localized<string>) ?? EMPTY_TEXT;
}
function asList(v: Prisma.JsonValue | null | undefined): Localized<string[]> {
  return (v as unknown as Localized<string[]>) ?? EMPTY_LIST;
}

/** DB row → the admin-facing shape (all JSON fields typed). */
function toAdmin(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categoryKey: row.categoryKey,
    status: row.status as ProductStatusValue,
    featured: row.featured,
    availability: row.availability as Availability,
    badge: (row.badge as ProductBadge | null) ?? null,
    image: row.image,
    sortOrder: row.sortOrder,
    gallery: (row.gallery as unknown as string[]) ?? [],
    shortDescription: asText(row.shortDescription),
    description: asText(row.description),
    features: asList(row.features),
    useCases: asList(row.useCases),
    specs:
      (row.specs as unknown as AdminProduct["specs"]) ?? [],
    marketplaces:
      (row.marketplaces as unknown as AdminProduct["marketplaces"]) ?? {},
    downloads:
      (row.downloads as unknown as AdminProduct["downloads"]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** DB row → the public `Product` shape the site components consume. */
function toPublic(row: ProductRow): Product {
  const a = toAdmin(row);
  return {
    slug: a.slug,
    name: a.name,
    categoryKey: a.categoryKey,
    image: a.image,
    gallery: a.gallery,
    ...(a.badge ? { badge: a.badge } : {}),
    availability: a.availability,
    featured: a.featured,
    active: a.status === "PUBLISHED",
    shortDescription: a.shortDescription,
    description: a.description,
    features: a.features,
    useCases: a.useCases,
    specs: a.specs,
    marketplaces: a.marketplaces,
    ...(a.downloads.length > 0 ? { downloads: a.downloads } : {}),
  };
}

/** Convert a write input into the Prisma data payload (JSON casts). */
function toData(input: ProductWriteInput): Prisma.ProductUncheckedCreateInput {
  return {
    slug: input.slug,
    name: input.name,
    categoryKey: input.categoryKey,
    status: input.status,
    featured: input.featured,
    availability: input.availability,
    badge: input.badge,
    image: input.image,
    gallery: input.gallery as unknown as Prisma.InputJsonValue,
    shortDescription: input.shortDescription as unknown as Prisma.InputJsonValue,
    description: input.description as unknown as Prisma.InputJsonValue,
    features: input.features as unknown as Prisma.InputJsonValue,
    useCases: input.useCases as unknown as Prisma.InputJsonValue,
    specs: input.specs as unknown as Prisma.InputJsonValue,
    marketplaces: input.marketplaces as unknown as Prisma.InputJsonValue,
    downloads: input.downloads as unknown as Prisma.InputJsonValue,
  };
}

const publicOrder: Prisma.ProductOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * PUBLIC ACCESSORS — mirror the old `@/config/products` API, now DB-backed and
 * async. Only PUBLISHED products are ever returned.
 * ══════════════════════════════════════════════════════════════════════════ */

export async function getActiveProducts(): Promise<readonly Product[]> {
  const rows = await prisma.product.findMany({
    where: { status: "PUBLISHED" },
    orderBy: publicOrder,
  });
  return rows.map(toPublic);
}

export async function getFeaturedProducts(limit?: number): Promise<readonly Product[]> {
  const rows = await prisma.product.findMany({
    where: { status: "PUBLISHED", featured: true },
    orderBy: publicOrder,
    ...(typeof limit === "number" ? { take: limit } : {}),
  });
  return rows.map(toPublic);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const row = await prisma.product.findFirst({
    where: { slug, status: "PUBLISHED" },
  });
  return row ? toPublic(row) : undefined;
}

export async function getActiveProductSlugs(): Promise<readonly string[]> {
  const rows = await prisma.product.findMany({
    where: { status: "PUBLISHED" },
    orderBy: publicOrder,
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

/** Related products — same category first, then filled from other active ones. */
export async function getRelatedProducts(
  slug: string,
  limit = 3,
): Promise<readonly Product[]> {
  const rows = await prisma.product.findMany({
    where: { status: "PUBLISHED", slug: { not: slug } },
    orderBy: publicOrder,
  });
  const current = await prisma.product.findFirst({
    where: { slug },
    select: { categoryKey: true },
  });
  const products = rows.map(toPublic);
  if (!current) return products.slice(0, limit);
  const same = products.filter((p) => p.categoryKey === current.categoryKey);
  const rest = products.filter((p) => p.categoryKey !== current.categoryKey);
  return [...same, ...rest].slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ADMIN (CMS) — every status visible; create / update / delete / reorder.
 * ══════════════════════════════════════════════════════════════════════════ */

export async function listAllProducts(): Promise<AdminProduct[]> {
  const rows = await prisma.product.findMany({ orderBy: publicOrder });
  return rows.map(toAdmin);
}

export async function getAdminProductById(id: string): Promise<AdminProduct | null> {
  const row = await prisma.product.findUnique({ where: { id } });
  return row ? toAdmin(row) : null;
}

/** Is a slug already taken (optionally excluding one product id)? */
export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const row = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  return Boolean(row && row.id !== exceptId);
}

export async function createProduct(input: ProductWriteInput): Promise<AdminProduct> {
  const max = await prisma.product.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;
  const row = await prisma.product.create({
    data: { ...toData(input), sortOrder },
  });
  return toAdmin(row);
}

export async function updateProduct(
  id: string,
  input: ProductWriteInput,
): Promise<AdminProduct> {
  const row = await prisma.product.update({ where: { id }, data: toData(input) });
  return toAdmin(row);
}

export async function setProductStatus(
  id: string,
  status: ProductStatusValue,
): Promise<void> {
  await prisma.product.update({ where: { id }, data: { status } });
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}

/** Counts per status — for the dashboard cards. */
export async function countProductsByStatus(): Promise<{
  total: number;
  published: number;
  draft: number;
  hidden: number;
}> {
  const [total, published, draft, hidden] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: "PUBLISHED" } }),
    prisma.product.count({ where: { status: "DRAFT" } }),
    prisma.product.count({ where: { status: "HIDDEN" } }),
  ]);
  return { total, published, draft, hidden };
}
