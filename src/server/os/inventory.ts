import "server-only";

import { Prisma, type StockMoveReason } from "@prisma/client";
import { db } from "@/lib/db";
import { getOsSettings } from "./settings";
import { D, ZERO, qty, toNum, unitCost, type Dec } from "./money";

/**
 * AYZENITH BUSINESS OS — the stock ledger.
 *
 * There is no `quantity` column anywhere. On-hand for (item, location) is
 * `SUM(StockMovement.quantity)` — positive rows in, negative rows out. The whole
 * module exists to keep that invariant true:
 *
 *   • every write goes through `postMovements`, which refuses to create a
 *     negative balance unless the owner has explicitly allowed it;
 *   • a transfer is always two rows sharing a `transferGroup`, so it can never
 *     half-happen;
 *   • outbound movements are valued at the WEIGHTED AVERAGE landed cost of what
 *     is actually on hand, so COGS reflects what the goods really cost rather
 *     than a list price someone typed once.
 *
 * All aggregation happens in SQL. Reading every movement into memory to add it
 * up would work at 500 rows and fall over at 500.000.
 */

export type MovementInput = {
  itemId: string;
  locationId: string;
  /** Signed: positive into the location, negative out of it. */
  quantity: Dec;
  reason: StockMoveReason;
  unitCost?: Dec | null;
  occurredAt?: Date;
  purchaseId?: string | null;
  saleId?: string | null;
  transferGroup?: string | null;
  note?: string | null;
  createdById?: string | null;
};

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

/** On-hand for one (item, location) INSIDE a transaction — the pre-flight check. */
async function onHandTx(
  tx: Prisma.TransactionClient,
  itemId: string,
  locationId: string,
): Promise<Dec> {
  const rows = await tx.stockMovement.aggregate({
    where: { itemId, locationId },
    _sum: { quantity: true },
  });
  return rows._sum.quantity ?? ZERO();
}

/**
 * Weighted-average landed cost of the units currently sitting in a location.
 *
 * Averaging only the INBOUND rows is deliberate. An outbound row carries the
 * cost it consumed, so including them would double-count the same money and
 * push the average toward zero after every sale.
 */
export async function averageCost(
  tx: Prisma.TransactionClient,
  itemId: string,
  locationId?: string | null,
): Promise<Dec | null> {
  const rows = await tx.stockMovement.findMany({
    where: {
      itemId,
      ...(locationId ? { locationId } : {}),
      quantity: { gt: 0 },
      unitCost: { not: null },
    },
    select: { quantity: true, unitCost: true },
  });
  if (rows.length === 0) return null;
  let value = ZERO();
  let units = ZERO();
  for (const r of rows) {
    if (!r.unitCost) continue;
    value = value.plus(r.quantity.mul(r.unitCost));
    units = units.plus(r.quantity);
  }
  if (units.isZero()) return null;
  return unitCost(value.div(units));
}

/**
 * Write movements atomically, refusing any that would create stock that does not
 * exist. `tx` is required: a movement never stands alone — it always belongs to
 * the purchase, sale or adjustment that caused it.
 */
export async function postMovements(
  tx: Prisma.TransactionClient,
  movements: MovementInput[],
): Promise<void> {
  if (movements.length === 0) return;
  const { allowNegativeStock } = await getOsSettings();

  if (!allowNegativeStock) {
    // Net the batch per (item, location) first, so a transfer that takes 10 out
    // of the depot and puts 10 into a shop is checked once, on the depot leg.
    const net = new Map<string, Dec>();
    for (const m of movements) {
      const key = `${m.itemId}::${m.locationId}`;
      net.set(key, (net.get(key) ?? ZERO()).plus(m.quantity));
    }
    for (const [key, delta] of net) {
      if (delta.gte(0)) continue;
      const [itemId, locationId] = key.split("::") as [string, string];
      const current = await onHandTx(tx, itemId, locationId);
      if (current.plus(delta).lt(0)) {
        const [item, location] = await Promise.all([
          tx.item.findUnique({ where: { id: itemId }, select: { name: true, unit: true } }),
          tx.stockLocation.findUnique({ where: { id: locationId }, select: { name: true } }),
        ]);
        throw new StockError(
          `Yetersiz stok: "${item?.name ?? itemId}" için ${location?.name ?? locationId} konumunda ` +
            `${current.toString()} ${item?.unit ?? ""} var, ${delta.abs().toString()} çıkış isteniyor. ` +
            `Ayarlar'dan eksi stoğa izin verebilir veya önce alış/transfer girebilirsin.`,
        );
      }
    }
  }

  await tx.stockMovement.createMany({
    data: movements.map((m) => ({
      itemId: m.itemId,
      locationId: m.locationId,
      quantity: qty(m.quantity),
      reason: m.reason,
      unitCost: m.unitCost ? unitCost(m.unitCost) : null,
      occurredAt: m.occurredAt ?? new Date(),
      purchaseId: m.purchaseId ?? null,
      saleId: m.saleId ?? null,
      transferGroup: m.transferGroup ?? null,
      note: m.note ?? null,
      createdById: m.createdById ?? null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type StockRow = {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  minStock: number | null;
  onHand: number;
  avgCost: number | null;
  stockValue: number;
  low: boolean;
};

export type StockByLocationRow = {
  locationId: string;
  locationName: string;
  locationType: string;
  onHand: number;
};

/**
 * The stock screen: one row per item with total on-hand, average cost and value,
 * computed entirely in Postgres. `LEFT JOIN` (not `INNER`) so a newly-created
 * item with no movements still appears — at zero, which is the honest answer.
 */
export async function listStock(opts: {
  search?: string;
  locationId?: string;
  lowOnly?: boolean;
  page?: number;
  perPage?: number;
} = {}): Promise<{ rows: StockRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 50));
  const offset = (page - 1) * perPage;
  const search = opts.search?.trim();
  const locFilter = opts.locationId
    ? Prisma.sql`AND m."locationId" = ${opts.locationId}`
    : Prisma.empty;
  const searchFilter = search
    ? Prisma.sql`AND (i."name" ILIKE ${"%" + search + "%"} OR i."sku" ILIKE ${"%" + search + "%"} OR i."barcode" ILIKE ${"%" + search + "%"})`
    : Prisma.empty;

  const rows = await db.$queryRaw<
    Array<{
      itemId: string;
      sku: string;
      name: string;
      unit: string;
      category: string | null;
      minStock: Prisma.Decimal | null;
      onHand: Prisma.Decimal | null;
      avgCost: Prisma.Decimal | null;
      total: bigint;
    }>
  >(Prisma.sql`
    WITH agg AS (
      SELECT
        i."id"        AS "itemId",
        i."sku",
        i."name",
        i."unit",
        i."category",
        i."minStock",
        COALESCE(SUM(m."quantity"), 0) AS "onHand",
        CASE WHEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END) > 0
             THEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" * m."unitCost" ELSE 0 END)
                  / SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END)
             ELSE NULL END AS "avgCost"
      FROM "Item" i
      LEFT JOIN "StockMovement" m ON m."itemId" = i."id" ${locFilter}
      WHERE i."active" = true ${searchFilter}
      GROUP BY i."id"
    )
    SELECT *, COUNT(*) OVER() AS "total"
    FROM agg
    ${opts.lowOnly ? Prisma.sql`WHERE "minStock" IS NOT NULL AND "onHand" <= "minStock"` : Prisma.empty}
    ORDER BY "name" ASC
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    rows: rows.map((r) => {
      const onHand = toNum(r.onHand);
      const avgCost = r.avgCost ? toNum(r.avgCost) : null;
      const minStock = r.minStock ? toNum(r.minStock) : null;
      return {
        itemId: r.itemId,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        category: r.category,
        minStock,
        onHand,
        avgCost,
        stockValue: avgCost != null ? onHand * avgCost : 0,
        low: minStock != null && onHand <= minStock,
      };
    }),
    total,
  };
}

/** Per-location breakdown for one item — "50 tane aldım, nereye dağıttım". */
export async function stockByLocation(itemId: string): Promise<StockByLocationRow[]> {
  const rows = await db.$queryRaw<
    Array<{ locationId: string; locationName: string; locationType: string; onHand: Prisma.Decimal }>
  >(Prisma.sql`
    SELECT l."id" AS "locationId", l."name" AS "locationName", l."type"::text AS "locationType",
           COALESCE(SUM(m."quantity"), 0) AS "onHand"
    FROM "StockLocation" l
    LEFT JOIN "StockMovement" m ON m."locationId" = l."id" AND m."itemId" = ${itemId}
    WHERE l."active" = true
    GROUP BY l."id"
    HAVING COALESCE(SUM(m."quantity"), 0) <> 0 OR l."isDefault" = true
    ORDER BY l."name" ASC
  `);
  return rows.map((r) => ({ ...r, onHand: toNum(r.onHand) }));
}

/** Total inventory value and low-stock count, for the dashboard. */
export async function stockSummary(): Promise<{ value: number; lowCount: number; skuCount: number }> {
  const rows = await db.$queryRaw<Array<{ value: Prisma.Decimal | null; low: bigint; skus: bigint }>>(
    Prisma.sql`
      WITH agg AS (
        SELECT i."id", i."minStock",
          COALESCE(SUM(m."quantity"), 0) AS "onHand",
          CASE WHEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END) > 0
               THEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" * m."unitCost" ELSE 0 END)
                    / SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END)
               ELSE NULL END AS "avgCost"
        FROM "Item" i
        LEFT JOIN "StockMovement" m ON m."itemId" = i."id"
        WHERE i."active" = true
        GROUP BY i."id"
      )
      SELECT
        COALESCE(SUM(CASE WHEN "avgCost" IS NOT NULL AND "onHand" > 0 THEN "onHand" * "avgCost" ELSE 0 END), 0) AS "value",
        COUNT(*) FILTER (WHERE "minStock" IS NOT NULL AND "onHand" <= "minStock") AS "low",
        COUNT(*) AS "skus"
      FROM agg
    `,
  );
  const r = rows[0];
  return {
    value: r?.value ? toNum(r.value) : 0,
    lowCount: r ? Number(r.low) : 0,
    skuCount: r ? Number(r.skus) : 0,
  };
}

/** Movement history for one item, newest first. */
export async function listMovements(opts: {
  itemId?: string;
  locationId?: string;
  page?: number;
  perPage?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 50));
  const where: Prisma.StockMovementWhereInput = {
    ...(opts.itemId ? { itemId: opts.itemId } : {}),
    ...(opts.locationId ? { locationId: opts.locationId } : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, quantity: true, reason: true, unitCost: true, occurredAt: true, note: true,
        item: { select: { id: true, sku: true, name: true, unit: true } },
        location: { select: { id: true, name: true } },
        purchase: { select: { id: true, code: true } },
        sale: { select: { id: true, code: true } },
      },
    }),
    db.stockMovement.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((m) => ({
      id: m.id,
      quantity: toNum(m.quantity),
      reason: m.reason,
      unitCost: m.unitCost ? toNum(m.unitCost) : null,
      occurredAt: m.occurredAt,
      note: m.note,
      item: m.item,
      location: m.location,
      docCode: m.purchase?.code ?? m.sale?.code ?? null,
      docHref: m.purchase ? `/os/purchases/${m.purchase.id}` : m.sale ? `/os/sales/${m.sale.id}` : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Manual operations
// ---------------------------------------------------------------------------

/** Move stock between two locations. Two rows, one group, one transaction. */
export async function transferStock(input: {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: Dec;
  note?: string | null;
  userId?: string | null;
}): Promise<void> {
  if (input.fromLocationId === input.toLocationId) {
    throw new StockError("Kaynak ve hedef konum aynı olamaz.");
  }
  if (input.quantity.lte(0)) throw new StockError("Transfer miktarı sıfırdan büyük olmalı.");

  await db.$transaction(async (tx) => {
    const cost = await averageCost(tx, input.itemId, input.fromLocationId);
    const group = `TR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await postMovements(tx, [
      {
        itemId: input.itemId,
        locationId: input.fromLocationId,
        quantity: input.quantity.neg(),
        reason: "TRANSFER",
        unitCost: cost,
        transferGroup: group,
        note: input.note ?? null,
        createdById: input.userId ?? null,
      },
      {
        itemId: input.itemId,
        locationId: input.toLocationId,
        quantity: input.quantity,
        reason: "TRANSFER",
        // The receiving leg carries the cost with it — otherwise moving goods to
        // a shop would make them look free when they are sold from there.
        unitCost: cost,
        transferGroup: group,
        note: input.note ?? null,
        createdById: input.userId ?? null,
      },
    ]);
  });
}

/** Opening balance, correction, damage. A signed one-off with a reason. */
export async function adjustStock(input: {
  itemId: string;
  locationId: string;
  quantity: Dec;
  reason: StockMoveReason;
  unitCost?: Dec | null;
  note?: string | null;
  userId?: string | null;
}): Promise<void> {
  if (input.quantity.isZero()) throw new StockError("Miktar sıfır olamaz.");
  await db.$transaction(async (tx) => {
    // An inbound adjustment with no cost given inherits the average, so it does
    // not dilute the item's valuation toward zero.
    let cost = input.unitCost ?? null;
    if (input.quantity.gt(0) && !cost) cost = await averageCost(tx, input.itemId, input.locationId);
    if (input.quantity.lt(0) && !cost) cost = await averageCost(tx, input.itemId, input.locationId);
    await postMovements(tx, [
      {
        itemId: input.itemId,
        locationId: input.locationId,
        quantity: input.quantity,
        reason: input.reason,
        unitCost: cost,
        note: input.note ?? null,
        createdById: input.userId ?? null,
      },
    ]);
  });
}

/** Locations for pickers. */
export async function listLocations(activeOnly = true) {
  return db.stockLocation.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true, active: true, channelId: true, city: true, country: true, note: true },
  });
}

/** The default landing place for goods, created on first use so the owner never
 *  has to configure anything before recording their first purchase. */
export async function ensureDefaultLocation(): Promise<string> {
  const existing = await db.stockLocation.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  if (existing) return existing.id;
  const any = await db.stockLocation.findFirst({ select: { id: true } });
  if (any) return any.id;
  const created = await db.stockLocation.create({
    data: { name: "Ana Depo", type: "WAREHOUSE", isDefault: true },
    select: { id: true },
  });
  return created.id;
}

export { D };
