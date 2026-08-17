import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseOptionalDecimal, toNum, toNumOrNull, type Dec } from "./money";

/**
 * AYZENITH BUSINESS OS — traded goods.
 *
 * `Item` is not the CMS `Product`. The CMS model is website content: localised
 * copy, a gallery, marketplace links — no cost, no price, no unit, no stock. A
 * traded good needs all four, and the two lists diverge immediately (you buy
 * packaging you never publish; you publish a service you never stock).
 * `cmsProductId` links the two when they happen to be the same thing.
 */

export type ItemListRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  purchasePrice: number | null;
  purchaseCurrency: string;
  salePrice: number | null;
  saleCurrency: string;
  minStock: number | null;
  active: boolean;
  onHand: number;
  avgCost: number | null;
  soldQty: number;
  /** Gross margin % implied by sale price vs. the cost actually realised. */
  marginPct: number | null;
};

export async function listItems(opts: {
  search?: string;
  category?: string;
  active?: boolean;
  page?: number;
  perPage?: number;
} = {}): Promise<{ rows: ItemListRow[]; total: number; page: number; perPage: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const search = opts.search?.trim();

  const where: Prisma.ItemWhereInput = {
    ...(opts.active === undefined ? {} : { active: opts.active }),
    ...(opts.category ? { category: opts.category } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.item.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, sku: true, name: true, category: true, brand: true, unit: true,
        purchasePrice: true, purchaseCurrency: true, salePrice: true, saleCurrency: true,
        minStock: true, active: true,
      },
    }),
    db.item.count({ where }),
  ]);
  if (rows.length === 0) return { rows: [], total, page, perPage };

  const stats = await itemStats(rows.map((r) => r.id));

  return {
    rows: rows.map((r) => {
      const s = stats.get(r.id);
      const salePrice = toNumOrNull(r.salePrice);
      const cost = s?.avgCost ?? toNumOrNull(r.purchasePrice);
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        brand: r.brand,
        unit: r.unit,
        purchasePrice: toNumOrNull(r.purchasePrice),
        purchaseCurrency: r.purchaseCurrency,
        salePrice,
        saleCurrency: r.saleCurrency,
        minStock: toNumOrNull(r.minStock),
        active: r.active,
        onHand: s?.onHand ?? 0,
        avgCost: s?.avgCost ?? null,
        soldQty: s?.soldQty ?? 0,
        marginPct:
          salePrice && cost && salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : null,
      };
    }),
    total,
    page,
    perPage,
  };
}

export type ItemStats = {
  onHand: number;
  avgCost: number | null;
  soldQty: number;
  soldRevenue: number;
  soldProfit: number;
};

/** On-hand, average cost and realised sales for a page of items, in one query. */
export async function itemStats(itemIds: string[]): Promise<Map<string, ItemStats>> {
  const out = new Map<string, ItemStats>();
  if (itemIds.length === 0) return out;

  const rows = await db.$queryRaw<
    Array<{
      itemId: string;
      onHand: Prisma.Decimal | null;
      avgCost: Prisma.Decimal | null;
      soldQty: Prisma.Decimal | null;
      soldRevenue: Prisma.Decimal | null;
      soldProfit: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    WITH ids AS (SELECT UNNEST(${itemIds}::text[]) AS "itemId"),
    stock AS (
      SELECT m."itemId",
             SUM(m."quantity") AS "onHand",
             CASE WHEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END) > 0
                  THEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" * m."unitCost" ELSE 0 END)
                       / SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END)
                  ELSE NULL END AS "avgCost"
      FROM "StockMovement" m
      WHERE m."itemId" = ANY(${itemIds})
      GROUP BY m."itemId"
    ),
    sold AS (
      SELECT sl."itemId",
             SUM(sl."quantity")                  AS "soldQty",
             SUM(sl."lineTotal" * s."fxRate")    AS "soldRevenue",
             SUM(sl."profit")                    AS "soldProfit"
      FROM "SaleLine" sl
      JOIN "Sale" s ON s."id" = sl."saleId"
      WHERE sl."itemId" = ANY(${itemIds}) AND s."status" IN ('CONFIRMED','COMPLETED')
      GROUP BY sl."itemId"
    )
    SELECT ids."itemId", stock."onHand", stock."avgCost",
           sold."soldQty", sold."soldRevenue", sold."soldProfit"
    FROM ids
    LEFT JOIN stock ON stock."itemId" = ids."itemId"
    LEFT JOIN sold  ON sold."itemId"  = ids."itemId"
  `);

  for (const r of rows) {
    out.set(r.itemId, {
      onHand: toNum(r.onHand),
      avgCost: r.avgCost ? toNum(r.avgCost) : null,
      soldQty: toNum(r.soldQty),
      soldRevenue: toNum(r.soldRevenue),
      soldProfit: toNum(r.soldProfit),
    });
  }
  return out;
}

export async function getItem(id: string) {
  const row = await db.item.findUnique({
    where: { id },
    include: {
      channelPrices: { include: { channel: { select: { id: true, name: true, type: true, commissionRate: true } } } },
    },
  });
  if (!row) return null;
  const stats = (await itemStats([id])).get(id) ?? null;
  return {
    ...row,
    purchasePrice: toNumOrNull(row.purchasePrice),
    salePrice: toNumOrNull(row.salePrice),
    vatRate: toNumOrNull(row.vatRate),
    minStock: toNumOrNull(row.minStock),
    channelPrices: row.channelPrices.map((p) => ({
      id: p.id,
      channelId: p.channelId,
      channelName: p.channel.name,
      channelType: p.channel.type,
      commissionRate: toNumOrNull(p.channel.commissionRate),
      price: toNum(p.price),
      currency: p.currency,
      active: p.active,
    })),
    stats,
  };
}

/** Purchase and sale history for the item detail tabs. */
export async function itemDocuments(itemId: string, take = 20) {
  const [purchases, sales] = await Promise.all([
    db.purchaseLine.findMany({
      where: { itemId, purchase: { status: { in: ["CONFIRMED", "COMPLETED"] } } },
      orderBy: { purchase: { issuedAt: "desc" } },
      take,
      select: {
        id: true, quantity: true, unitPrice: true, landedUnitCost: true,
        purchase: { select: { id: true, code: true, issuedAt: true, currency: true, supplier: { select: { name: true } } } },
      },
    }),
    db.saleLine.findMany({
      where: { itemId, sale: { status: { in: ["CONFIRMED", "COMPLETED"] } } },
      orderBy: { sale: { issuedAt: "desc" } },
      take,
      select: {
        id: true, quantity: true, unitPrice: true, unitCost: true, profit: true, lineTotal: true,
        sale: {
          select: {
            id: true, code: true, issuedAt: true, currency: true, fxRate: true,
            customer: { select: { name: true } }, channel: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    purchases: purchases.map((l) => ({
      id: l.id,
      quantity: toNum(l.quantity),
      unitPrice: toNum(l.unitPrice),
      landedUnitCost: toNumOrNull(l.landedUnitCost),
      docId: l.purchase.id,
      code: l.purchase.code,
      issuedAt: l.purchase.issuedAt,
      currency: l.purchase.currency,
      partyName: l.purchase.supplier.name,
    })),
    sales: sales.map((l) => ({
      id: l.id,
      quantity: toNum(l.quantity),
      unitPrice: toNum(l.unitPrice),
      unitCost: toNumOrNull(l.unitCost),
      profit: toNum(l.profit),
      // `profit` is always base-currency (see confirmSale). Revenue must be
      // converted the same way before the two are compared for a margin %,
      // or a foreign-currency sale silently divides mismatched units.
      revenueBase: toNum(l.lineTotal.mul(l.sale.fxRate)),
      docId: l.sale.id,
      code: l.sale.code,
      issuedAt: l.sale.issuedAt,
      currency: l.sale.currency,
      partyName: l.sale.customer?.name ?? null,
      channelName: l.sale.channel?.name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ItemInput = {
  sku: string;
  name: string;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  unit?: string;
  purchasePrice?: Dec | null;
  purchaseCurrency?: string;
  salePrice?: Dec | null;
  saleCurrency?: string;
  vatRate?: Dec | null;
  minStock?: Dec | null;
  active?: boolean;
  description?: string | null;
  notes?: string | null;
};

function itemData(input: ItemInput) {
  return {
    sku: input.sku.trim(),
    name: input.name.trim(),
    barcode: input.barcode?.trim() || null,
    category: input.category?.trim() || null,
    brand: input.brand?.trim() || null,
    unit: input.unit?.trim() || "adet",
    purchasePrice: input.purchasePrice ?? null,
    purchaseCurrency: input.purchaseCurrency || "TRY",
    salePrice: input.salePrice ?? null,
    saleCurrency: input.saleCurrency || "TRY",
    vatRate: input.vatRate ?? null,
    minStock: input.minStock ?? null,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createItem(input: ItemInput, userId?: string | null) {
  return db.item.create({
    data: { ...itemData(input), active: input.active ?? true, createdById: userId ?? null },
  });
}

export async function updateItem(id: string, input: ItemInput) {
  return db.item.update({
    where: { id },
    data: { ...itemData(input), ...(input.active === undefined ? {} : { active: input.active }) },
  });
}

export async function setChannelPrice(input: {
  itemId: string;
  channelId: string;
  price: Dec | null;
  currency: string;
}) {
  if (input.price == null) {
    await db.itemChannelPrice.deleteMany({
      where: { itemId: input.itemId, channelId: input.channelId },
    });
    return;
  }
  await db.itemChannelPrice.upsert({
    where: { itemId_channelId: { itemId: input.itemId, channelId: input.channelId } },
    create: { itemId: input.itemId, channelId: input.channelId, price: input.price, currency: input.currency },
    update: { price: input.price, currency: input.currency, active: true },
  });
}

/**
 * The price to offer for (item, channel): the channel override if one exists,
 * otherwise the item's own sale price. Sales forms pre-fill from this, which is
 * how "Trendyol ₺1.499 / web ₺1.399" stops being something to remember.
 */
export async function priceFor(itemId: string, channelId?: string | null): Promise<{ price: Dec | null; currency: string }> {
  if (channelId) {
    const override = await db.itemChannelPrice.findUnique({
      where: { itemId_channelId: { itemId, channelId } },
      select: { price: true, currency: true, active: true },
    });
    if (override?.active) return { price: override.price, currency: override.currency };
  }
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { salePrice: true, saleCurrency: true },
  });
  return { price: item?.salePrice ?? null, currency: item?.saleCurrency ?? "TRY" };
}

export async function deleteItemIfUnused(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const [moves, saleLines, purchaseLines] = await Promise.all([
    db.stockMovement.count({ where: { itemId: id } }),
    db.saleLine.count({ where: { itemId: id } }),
    db.purchaseLine.count({ where: { itemId: id } }),
  ]);
  if (moves + saleLines + purchaseLines > 0) {
    await db.item.update({ where: { id }, data: { active: false } });
    return {
      deleted: false,
      reason: `Bu ürünün ${moves} stok hareketi ve ${saleLines + purchaseLines} belge satırı var. Silinmedi, pasife alındı.`,
    };
  }
  await db.item.delete({ where: { id } });
  return { deleted: true };
}

export async function listCategories(): Promise<string[]> {
  const rows = await db.item.findMany({
    where: { category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
}

/** Picker source for document line forms. */
export async function searchItems(query: string, take = 20) {
  const q = query.trim();
  return db.item.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take,
    select: { id: true, sku: true, name: true, unit: true, salePrice: true, saleCurrency: true, purchasePrice: true, purchaseCurrency: true, vatRate: true },
  });
}

export { parseOptionalDecimal };
