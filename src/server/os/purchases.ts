import "server-only";

import { Prisma, type CostAllocation, type CostKind, type DocStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { D, ZERO, lineTotal, money, sum, toNum, toNumOrNull, type Dec } from "./money";
import { allocateCosts, dueDateFor, landedUnitCostOf } from "./documents";
import { nextCode } from "./sequence";
import { postMovements, StockError, ensureDefaultLocation } from "./inventory";
import { getOsSettings } from "./settings";
import { DOC_PREFIX } from "@/config/os";

/**
 * AYZENITH BUSINESS OS — buying.
 *
 * A purchase is DRAFT until it is confirmed, and a draft has no side effects at
 * all: no stock, no payable, no cost. Confirming does four things in ONE
 * transaction, so the system can never be left half-posted:
 *
 *   1. spreads the cost lines (freight, customs, ...) over the goods,
 *   2. writes the landed unit cost onto each line,
 *   3. posts one inbound stock movement per line CARRYING that cost,
 *   4. creates the payable to the supplier.
 *
 * The payable is the GOODS value only. Freight owed to a shipping company is a
 * different creditor, so it is recorded as a cost here (it must reach landed
 * cost) and scheduled, if the owner wants, as its own expense. Rolling it into
 * the supplier's balance would make that balance wrong.
 */

export type PurchaseLineInput = {
  itemId: string;
  quantity: Dec;
  unitPrice: Dec;
  discountRate?: Dec;
  vatRate?: Dec;
  note?: string | null;
};

export type CostLineInput = {
  kind: CostKind;
  label?: string | null;
  amount: Dec;
  currency: string;
  fxRate: Dec;
  allocation?: CostAllocation;
  note?: string | null;
};

export type PurchaseInput = {
  supplierId: string;
  locationId?: string | null;
  issuedAt?: Date;
  dueDate?: Date | null;
  paymentTermDays?: number | null;
  currency: string;
  fxRate: Dec;
  fxRateDate?: Date | null;
  status?: DocStatus;
  note?: string | null;
  lines: PurchaseLineInput[];
  costs?: CostLineInput[];
};

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

function computeLineTotals(lines: PurchaseLineInput[]) {
  return lines.map((l) => ({
    ...l,
    discountRate: l.discountRate ?? ZERO(),
    vatRate: l.vatRate ?? ZERO(),
    total: lineTotal(l.quantity, l.unitPrice, l.discountRate ?? ZERO()),
  }));
}

export async function createPurchase(input: PurchaseInput, userId?: string | null): Promise<string> {
  if (input.lines.length === 0) throw new DocumentError("En az bir ürün satırı gerekli.");
  for (const l of input.lines) {
    if (l.quantity.lte(0)) throw new DocumentError("Miktar sıfırdan büyük olmalı.");
  }

  const issuedAt = input.issuedAt ?? new Date();
  const locationId = input.locationId || (await ensureDefaultLocation());
  const priced = computeLineTotals(input.lines);
  const subtotal = money(sum(priced.map((l) => l.total)));

  // Cost lines carry their own currency; express them in the DOCUMENT currency
  // so the header totals are internally consistent.
  const costs = input.costs ?? [];
  const costTotalDoc = money(
    sum(costs.map((c) => (input.fxRate.isZero() ? ZERO() : c.amount.mul(c.fxRate).div(input.fxRate)))),
  );

  const id = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, DOC_PREFIX.PURCHASE, issuedAt.getFullYear());
    const purchase = await tx.purchase.create({
      data: {
        code,
        supplierId: input.supplierId,
        locationId,
        issuedAt,
        dueDate: input.dueDate ?? null,
        paymentTermDays: input.paymentTermDays ?? null,
        currency: input.currency,
        fxRate: input.fxRate,
        fxRateDate: input.fxRateDate ?? issuedAt,
        status: "DRAFT",
        subtotal,
        costTotal: costTotalDoc,
        total: money(subtotal.plus(costTotalDoc)),
        note: input.note?.trim() || null,
        createdById: userId ?? null,
        lines: {
          create: priced.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountRate: l.discountRate,
            vatRate: l.vatRate,
            lineTotal: l.total,
            note: l.note?.trim() || null,
          })),
        },
        costs: {
          create: costs.map((c) => ({
            kind: c.kind,
            label: c.label?.trim() || null,
            amount: c.amount,
            currency: c.currency,
            fxRate: c.fxRate,
            fxRateDate: issuedAt,
            allocation: c.allocation ?? "BY_VALUE",
            occurredAt: issuedAt,
            note: c.note?.trim() || null,
          })),
        },
      },
      select: { id: true },
    });
    return purchase.id;
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.purchase.create",
    entity: "Purchase",
    entityId: id,
    summary: `Alış oluşturuldu (${input.currency})`,
  });

  if ((input.status ?? "CONFIRMED") === "CONFIRMED") await confirmPurchase(id, userId);
  return id;
}

/**
 * Post a draft purchase. Idempotent by status check: confirming twice would
 * double the stock, so a non-draft document is refused rather than re-posted.
 */
export async function confirmPurchase(id: string, userId?: string | null): Promise<void> {
  const settings = await getOsSettings();

  await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: { lines: true, costs: true },
    });
    if (!purchase) throw new DocumentError("Alış bulunamadı.");
    if (purchase.status !== "DRAFT") {
      throw new DocumentError(`Bu alış zaten "${purchase.status}" durumunda; tekrar onaylanamaz.`);
    }
    if (purchase.lines.length === 0) throw new DocumentError("Ürün satırı olmayan alış onaylanamaz.");
    const locationId = purchase.locationId;
    if (!locationId) throw new DocumentError("Malların gireceği stok konumu seçilmemiş.");

    // Everything below is BASE currency: goods converted at the document rate,
    // each cost at its own rate.
    const baseLines = purchase.lines.map((l) => ({
      baseValue: l.lineTotal.mul(purchase.fxRate),
      quantity: l.quantity,
    }));
    const baseCosts = purchase.costs.map((c) => ({
      baseAmount: c.amount.mul(c.fxRate),
      allocation: c.allocation,
    }));
    const shares = allocateCosts(baseLines, baseCosts);

    for (let i = 0; i < purchase.lines.length; i += 1) {
      const line = purchase.lines[i];
      const base = baseLines[i];
      const share = shares[i] ?? ZERO();
      if (!line || !base) continue;
      const landed = landedUnitCostOf(base.baseValue, share, line.quantity);
      await tx.purchaseLine.update({
        where: { id: line.id },
        data: { landedUnitCost: landed },
      });
    }

    await postMovements(
      tx,
      purchase.lines.map((line, i) => {
        const base = baseLines[i];
        const share = shares[i] ?? ZERO();
        return {
          itemId: line.itemId,
          locationId,
          quantity: line.quantity,
          reason: "PURCHASE" as const,
          unitCost: base ? landedUnitCostOf(base.baseValue, share, line.quantity) : null,
          occurredAt: purchase.issuedAt,
          purchaseId: purchase.id,
          createdById: userId ?? null,
        };
      }),
    );

    // The supplier payable: goods only, at the document's own rate.
    const payable = purchase.subtotal;
    if (payable.gt(0)) {
      await tx.payment.create({
        data: {
          direction: "OUT",
          partyId: purchase.supplierId,
          purchaseId: purchase.id,
          amount: payable,
          currency: purchase.currency,
          fxRate: purchase.fxRate,
          fxRateDate: purchase.fxRateDate,
          dueDate: dueDateFor(purchase.issuedAt, purchase.dueDate, purchase.paymentTermDays),
          status: "PENDING",
          note: `${purchase.code} alış bedeli`,
          createdById: userId ?? null,
        },
      });
    }

    await tx.purchase.update({ where: { id }, data: { status: "CONFIRMED" } });

    // Keep the item's reference purchase price current, in its own currency, so
    // the next purchase form pre-fills with what was last actually paid.
    for (const line of purchase.lines) {
      await tx.item.update({
        where: { id: line.itemId },
        data: { purchasePrice: line.unitPrice, purchaseCurrency: purchase.currency },
      });
    }

    void settings;
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.purchase.confirm",
    entity: "Purchase",
    entityId: id,
    summary: "Alış onaylandı; stok ve borç oluştu",
  });
}

/**
 * Cancel a confirmed purchase. Movements are REVERSED with mirror rows rather
 * than deleted, so the ledger still explains what happened and when. Its
 * payments are cancelled, never removed.
 */
export async function cancelPurchase(id: string, userId?: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: { movements: true },
    });
    if (!purchase) throw new DocumentError("Alış bulunamadı.");
    if (purchase.status === "CANCELLED") return;

    if (purchase.movements.length > 0) {
      await postMovements(
        tx,
        purchase.movements.map((m) => ({
          itemId: m.itemId,
          locationId: m.locationId,
          quantity: m.quantity.neg(),
          reason: "ADJUSTMENT" as const,
          unitCost: m.unitCost,
          occurredAt: new Date(),
          purchaseId: purchase.id,
          note: `${purchase.code} iptali`,
          createdById: userId ?? null,
        })),
      );
    }
    await tx.payment.updateMany({
      where: { purchaseId: id, status: { in: ["PENDING", "PARTIAL"] } },
      data: { status: "CANCELLED" },
    });
    await tx.purchase.update({ where: { id }, data: { status: "CANCELLED" } });
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.purchase.cancel",
    entity: "Purchase",
    entityId: id,
    summary: "Alış iptal edildi; stok ve borç geri alındı",
  });
}

/** A draft carries nothing, so it can be removed outright. */
export async function deletePurchase(id: string, userId?: string | null): Promise<void> {
  const purchase = await db.purchase.findUnique({ where: { id }, select: { status: true, code: true } });
  if (!purchase) return;
  if (purchase.status !== "DRAFT") {
    throw new DocumentError("Sadece taslak alışlar silinebilir. Onaylı bir alışı iptal et.");
  }
  await db.purchase.delete({ where: { id } });
  await logActivity({
    userId: userId ?? null,
    action: "os.purchase.delete",
    entity: "Purchase",
    entityId: id,
    summary: `Taslak alış silindi (${purchase.code})`,
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPurchases(opts: {
  search?: string;
  supplierId?: string;
  status?: DocStatus;
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
} = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const where: Prisma.PurchaseWhereInput = {
    ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.from || opts.to
      ? { issuedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {}),
    ...(opts.search?.trim()
      ? {
          OR: [
            { code: { contains: opts.search.trim(), mode: "insensitive" } },
            { supplier: { name: { contains: opts.search.trim(), mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.purchase.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, code: true, issuedAt: true, dueDate: true, status: true,
        currency: true, fxRate: true, subtotal: true, costTotal: true, total: true,
        supplier: { select: { id: true, name: true } },
        location: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    db.purchase.count({ where }),
  ]);
  return {
    total, page, perPage,
    rows: rows.map((p) => ({
      id: p.id,
      code: p.code,
      issuedAt: p.issuedAt,
      dueDate: p.dueDate,
      status: p.status,
      currency: p.currency,
      subtotal: toNum(p.subtotal),
      costTotal: toNum(p.costTotal),
      total: toNum(p.total),
      baseTotal: toNum(p.total.mul(p.fxRate)),
      supplierId: p.supplier.id,
      supplierName: p.supplier.name,
      locationName: p.location?.name ?? null,
      lineCount: p._count.lines,
    })),
  };
}

export async function getPurchase(id: string) {
  const p = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, country: true, currency: true } },
      location: { select: { id: true, name: true } },
      lines: { include: { item: { select: { id: true, sku: true, name: true, unit: true } } } },
      costs: true,
      payments: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    fxRate: toNum(p.fxRate),
    subtotal: toNum(p.subtotal),
    costTotal: toNum(p.costTotal),
    total: toNum(p.total),
    lines: p.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      sku: l.item.sku,
      name: l.item.name,
      unit: l.item.unit,
      quantity: toNum(l.quantity),
      unitPrice: toNum(l.unitPrice),
      discountRate: toNum(l.discountRate),
      vatRate: toNum(l.vatRate),
      lineTotal: toNum(l.lineTotal),
      landedUnitCost: toNumOrNull(l.landedUnitCost),
      note: l.note,
    })),
    costs: p.costs.map((c) => ({
      id: c.id, kind: c.kind, label: c.label,
      amount: toNum(c.amount), currency: c.currency, fxRate: toNum(c.fxRate),
      allocation: c.allocation, note: c.note,
    })),
    payments: p.payments.map((x) => ({
      id: x.id, amount: toNum(x.amount), paidAmount: toNum(x.paidAmount),
      currency: x.currency, dueDate: x.dueDate, paidAt: x.paidAt, status: x.status, method: x.method,
    })),
  };
}

export { StockError, D };
