import "server-only";

import { Prisma, type StockMoveReason } from "@prisma/client";
import { db } from "@/lib/db";
import { getOsSettings } from "./settings";
import { D, ZERO, qty, toNum, unitCost, type Dec } from "./money";
import { applyMove, replay, CostRequiredError, type CostState, type CostWarning } from "./moving-average";

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

// ---------------------------------------------------------------------------
// Cost state — moving weighted average, per SKU, company-wide
// ---------------------------------------------------------------------------

type LockedCost = { state: CostState; movementCount: number };

/**
 * Lock one SKU's `ItemCostState` row for the rest of the transaction and make
 * sure it matches the ledger. Two sales of the same SKU therefore take turns:
 * the second one reads the average the first one left behind, never the same
 * stale one.
 *
 * If the row's `movementCount` differs from the ledger (first use, or something
 * wrote movements around this function), it is rebuilt from the ledger with the
 * same rule. Rebuilding changes no movement and no past sale.
 */
async function lockCostState(tx: Prisma.TransactionClient, itemId: string): Promise<LockedCost> {
  await tx.$executeRaw`
    INSERT INTO "ItemCostState" ("itemId", "onHand", "avgUnitCost", "uncostedQty", "movementCount", "updatedAt")
    VALUES (${itemId}, 0, NULL, 0, -1, NOW())
    ON CONFLICT ("itemId") DO NOTHING`;
  const rows = await tx.$queryRaw<
    Array<{ onHand: Prisma.Decimal; avgUnitCost: Prisma.Decimal | null; uncostedQty: Prisma.Decimal; movementCount: number }>
  >`SELECT "onHand", "avgUnitCost", "uncostedQty", "movementCount"
      FROM "ItemCostState" WHERE "itemId" = ${itemId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new StockError("Maliyet kaydı kilitlenemedi.");

  const ledgerCount = await tx.stockMovement.count({ where: { itemId } });
  if (row.movementCount === ledgerCount) {
    return {
      state: { onHand: D(row.onHand), avgUnitCost: row.avgUnitCost ? D(row.avgUnitCost) : null, uncostedQty: D(row.uncostedQty) },
      movementCount: row.movementCount,
    };
  }

  const history = await tx.stockMovement.findMany({
    where: { itemId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { quantity: true, reason: true, unitCost: true, purchaseId: true, note: true },
  });
  const rebuilt = replay(
    history.map((m) => ({ quantity: m.quantity, reason: m.reason, unitCost: m.unitCost, purchaseId: m.purchaseId, ref: m.note })),
  );
  await tx.itemCostState.update({
    where: { itemId },
    data: {
      onHand: rebuilt.state.onHand,
      avgUnitCost: rebuilt.state.avgUnitCost,
      uncostedQty: rebuilt.state.uncostedQty,
      movementCount: ledgerCount,
    },
  });
  if (row.movementCount !== -1) {
    await tx.activityLog.create({
      data: {
        userId: null,
        action: "os.cost.rebuilt",
        entity: "Item",
        entityId: itemId,
        summary: `Maliyet durumu defterle uyuşmuyordu (${row.movementCount} ≠ ${ledgerCount} hareket); defterden yeniden hesaplandı.`,
      },
    });
  }
  return { state: rebuilt.state, movementCount: ledgerCount };
}

/**
 * Lock several SKUs at once, always in the same (sorted) order, so two
 * documents touching the same SKUs in a different line order cannot deadlock.
 * Call this before reading `averageCost` for a multi-line document.
 */
export async function lockItemCosts(tx: Prisma.TransactionClient, itemIds: string[]): Promise<void> {
  for (const id of [...new Set(itemIds)].sort()) await lockCostState(tx, id);
}

/**
 * The SKU's current moving weighted-average cost in base currency, company-wide.
 * Locks the SKU's cost row until the transaction ends. Null = there is no
 * average (no stock, or only uncosted history).
 */
export async function averageCost(tx: Prisma.TransactionClient, itemId: string): Promise<Dec | null> {
  const { state } = await lockCostState(tx, itemId);
  return state.avgUnitCost;
}

/**
 * Write movements atomically, refusing any that would create stock that does not
 * exist. `tx` is required: a movement never stands alone — it always belongs to
 * the purchase, sale or adjustment that caused it.
 *
 * Every movement also moves its SKU's cost state, in the same transaction:
 * the cost each row carries is DECIDED here by the moving-average rule
 * (outbound at the current average, a purchase cancellation at its own cost, a
 * costless inbound at the current average or refused). Cost warnings are
 * written to the activity log inside the transaction and returned.
 */
export async function postMovements(
  tx: Prisma.TransactionClient,
  movements: MovementInput[],
): Promise<CostWarning[]> {
  if (movements.length === 0) return [];
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

  // Run every movement through its SKU's cost state, SKUs locked in sorted order.
  const decidedCost = new Map<MovementInput, Dec | null>();
  const nextState = new Map<string, LockedCost & { added: number }>();
  const warnings: Array<CostWarning & { itemId: string; userId: string | null }> = [];
  for (const itemId of [...new Set(movements.map((m) => m.itemId))].sort()) {
    const locked = await lockCostState(tx, itemId);
    let state = locked.state;
    let added = 0;
    for (const m of movements) {
      if (m.itemId !== itemId) continue;
      let r;
      try {
        r = applyMove(
          state,
          { quantity: qty(m.quantity), reason: m.reason, unitCost: m.unitCost ?? null, purchaseId: m.purchaseId, ref: m.note },
          "live",
        );
      } catch (e) {
        if (e instanceof CostRequiredError) {
          const item = await tx.item.findUnique({ where: { id: itemId }, select: { name: true } });
          throw new StockError(`"${item?.name ?? itemId}": ${e.message}`);
        }
        throw e;
      }
      state = r.state;
      added += 1;
      decidedCost.set(m, r.unitCost);
      for (const w of r.warnings) warnings.push({ ...w, itemId, userId: m.createdById ?? null });
    }
    nextState.set(itemId, { state, movementCount: locked.movementCount, added });
  }

  await tx.stockMovement.createMany({
    data: movements.map((m) => {
      const cost = decidedCost.get(m) ?? null;
      return {
        itemId: m.itemId,
        locationId: m.locationId,
        quantity: qty(m.quantity),
        reason: m.reason,
        unitCost: cost ? unitCost(cost) : null,
        occurredAt: m.occurredAt ?? new Date(),
        purchaseId: m.purchaseId ?? null,
        saleId: m.saleId ?? null,
        transferGroup: m.transferGroup ?? null,
        note: m.note ?? null,
        createdById: m.createdById ?? null,
      };
    }),
  });

  for (const [itemId, s] of nextState) {
    await tx.itemCostState.update({
      where: { itemId },
      data: {
        onHand: s.state.onHand,
        avgUnitCost: s.state.avgUnitCost,
        uncostedQty: s.state.uncostedQty,
        movementCount: s.movementCount + s.added,
      },
    });
  }

  if (warnings.length > 0) {
    await tx.activityLog.createMany({
      data: warnings.map((w) => ({
        userId: w.userId,
        action: `os.cost.${w.code.toLowerCase()}`,
        entity: "Item",
        entityId: w.itemId,
        summary: w.message,
      })),
    });
  }
  return warnings;
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
        MAX(cs."avgUnitCost") AS "avgCost"
      FROM "Item" i
      LEFT JOIN "StockMovement" m ON m."itemId" = i."id" ${locFilter}
      LEFT JOIN "ItemCostState" cs ON cs."itemId" = i."id"
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
          MAX(cs."avgUnitCost") AS "avgCost"
        FROM "Item" i
        LEFT JOIN "StockMovement" m ON m."itemId" = i."id"
        LEFT JOIN "ItemCostState" cs ON cs."itemId" = i."id"
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
    // Company-wide cost: a transfer moves units, not value. Both legs carry the
    // current average only so the ledger reads sensibly.
    const cost = await averageCost(tx, input.itemId);
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
    // postMovements decides the cost: an outbound leaves at the average, an
    // inbound with no cost given takes the average — or is refused when there
    // is none, rather than entering at zero.
    await postMovements(tx, [
      {
        itemId: input.itemId,
        locationId: input.locationId,
        quantity: input.quantity,
        reason: input.reason,
        unitCost: input.unitCost ?? null,
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
