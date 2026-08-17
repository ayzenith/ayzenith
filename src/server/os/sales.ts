import "server-only";

import { Prisma, type DocStatus, type TradeModel } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { D, ZERO, lineTotal, money, sum, toNum, toNumOrNull, type Dec } from "./money";
import { allocateCosts, commissionAmount, dueDateFor } from "./documents";
import { nextCode } from "./sequence";
import { averageCost, postMovements, StockError, ensureDefaultLocation } from "./inventory";
import { getOsSettings, suggestFxRate } from "./settings";
import { DocumentError, type CostLineInput } from "./purchases";
import { DOC_PREFIX } from "@/config/os";

/**
 * AYZENITH BUSINESS OS — selling, and the profit that falls out of it.
 *
 * Profit is never typed. Confirming a sale values every line at the WEIGHTED
 * AVERAGE landed cost of the stock it actually consumed, applies the channel's
 * commission and any direct cost lines, and derives:
 *
 *     kâr = satış geliri − satılan malın gerçek maliyeti − doğrudan maliyetler
 *
 * all in base currency, using each row's own exchange rate. A sale in EUR whose
 * goods were bought in USD and shipped for TRY produces one honest margin.
 *
 * STOKSUZ SATIŞ (dropship) is a first-class case: `tradeModel = DROPSHIP` skips
 * the stock ledger entirely, because the goods never entered your warehouse.
 * Cost then comes from the item's recorded purchase price — and if there is no
 * such price, the line's cost is recorded as unknown (null) rather than as zero,
 * so the margin is never flattered by a missing number.
 */

export type SaleLineInput = {
  itemId: string;
  quantity: Dec;
  unitPrice: Dec;
  discountRate?: Dec;
  vatRate?: Dec;
  note?: string | null;
};

export type SaleInput = {
  customerId?: string | null;
  channelId?: string | null;
  locationId?: string | null;
  issuedAt?: Date;
  dueDate?: Date | null;
  paymentTermDays?: number | null;
  currency: string;
  fxRate: Dec;
  fxRateDate?: Date | null;
  status?: DocStatus;
  tradeModel?: TradeModel | null;
  radarSnapshotId?: string | null;
  note?: string | null;
  lines: SaleLineInput[];
  costs?: CostLineInput[];
};

export async function createSale(input: SaleInput, userId?: string | null): Promise<string> {
  if (input.lines.length === 0) throw new DocumentError("En az bir ürün satırı gerekli.");
  for (const l of input.lines) {
    if (l.quantity.lte(0)) throw new DocumentError("Miktar sıfırdan büyük olmalı.");
  }

  const issuedAt = input.issuedAt ?? new Date();
  const dropship = input.tradeModel === "DROPSHIP";
  const locationId = dropship ? null : input.locationId || (await ensureDefaultLocation());

  const priced = input.lines.map((l) => ({
    ...l,
    discountRate: l.discountRate ?? ZERO(),
    vatRate: l.vatRate ?? ZERO(),
    total: lineTotal(l.quantity, l.unitPrice, l.discountRate ?? ZERO()),
  }));
  const subtotal = money(sum(priced.map((l) => l.total)));

  // The channel's commission is a real cost of selling there, so it is written
  // as a cost line rather than silently deducted — it has to be visible next to
  // freight when the owner asks why Trendyol margin is thinner.
  const costs: CostLineInput[] = [...(input.costs ?? [])];
  if (input.channelId && !costs.some((c) => c.kind === "COMMISSION")) {
    const channel = await db.channel.findUnique({
      where: { id: input.channelId },
      select: { commissionRate: true, name: true },
    });
    const amount = commissionAmount(subtotal, channel?.commissionRate ?? null);
    if (amount.gt(0)) {
      costs.push({
        kind: "COMMISSION",
        label: `${channel?.name ?? "Kanal"} komisyonu`,
        amount,
        currency: input.currency,
        fxRate: input.fxRate,
        allocation: "BY_VALUE",
      });
    }
  }

  const costTotalDoc = money(
    sum(costs.map((c) => (input.fxRate.isZero() ? ZERO() : c.amount.mul(c.fxRate).div(input.fxRate)))),
  );

  const id = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, DOC_PREFIX.SALE, issuedAt.getFullYear());
    const sale = await tx.sale.create({
      data: {
        code,
        customerId: input.customerId || null,
        channelId: input.channelId || null,
        locationId,
        issuedAt,
        dueDate: input.dueDate ?? null,
        paymentTermDays: input.paymentTermDays ?? null,
        currency: input.currency,
        fxRate: input.fxRate,
        fxRateDate: input.fxRateDate ?? issuedAt,
        status: "DRAFT",
        tradeModel: input.tradeModel ?? null,
        subtotal,
        costTotal: costTotalDoc,
        total: subtotal,
        radarSnapshotId: input.radarSnapshotId || null,
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
    return sale.id;
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.sale.create",
    entity: "Sale",
    entityId: id,
    summary: `Satış oluşturuldu (${input.currency})`,
  });

  if ((input.status ?? "CONFIRMED") === "CONFIRMED") await confirmSale(id, userId);
  return id;
}

/**
 * Post a draft sale: consume stock, value it, compute margin, create the
 * receivable. One transaction — a sale that took the goods but failed to record
 * the money owed would be worse than one that failed outright.
 */
export async function confirmSale(id: string, userId?: string | null): Promise<void> {
  const settings = await getOsSettings();

  await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { purchasePrice: true, purchaseCurrency: true } } } }, costs: true },
    });
    if (!sale) throw new DocumentError("Satış bulunamadı.");
    if (sale.status !== "DRAFT") {
      throw new DocumentError(`Bu satış zaten "${sale.status}" durumunda; tekrar onaylanamaz.`);
    }
    if (sale.lines.length === 0) throw new DocumentError("Ürün satırı olmayan satış onaylanamaz.");

    const dropship = sale.tradeModel === "DROPSHIP";
    if (!dropship && !sale.locationId) {
      throw new DocumentError("Stoğun düşeceği konum seçilmemiş.");
    }

    // Direct costs of selling, in base currency, spread over the lines.
    const baseLines = sale.lines.map((l) => ({
      baseValue: l.lineTotal.mul(sale.fxRate),
      quantity: l.quantity,
    }));
    const baseCosts = sale.costs.map((c) => ({
      baseAmount: c.amount.mul(c.fxRate),
      allocation: c.allocation,
    }));
    const costShares = allocateCosts(baseLines, baseCosts);

    let cogsTotal = ZERO();
    let profitTotal = ZERO();
    const movements: Parameters<typeof postMovements>[1] = [];

    for (let i = 0; i < sale.lines.length; i += 1) {
      const line = sale.lines[i];
      const base = baseLines[i];
      const share = costShares[i] ?? ZERO();
      if (!line || !base) continue;

      let unit: Dec | null = null;
      if (dropship) {
        // No stock was consumed. Value from what the goods are known to cost.
        if (line.item.purchasePrice) {
          const rate = suggestFxRate(settings, line.item.purchaseCurrency);
          unit = line.item.purchasePrice.mul(rate);
        }
      } else {
        unit = await averageCost(tx, line.itemId, sale.locationId);
      }

      const lineCogs = unit ? unit.mul(line.quantity) : ZERO();
      const lineProfit = base.baseValue.minus(lineCogs).minus(share);

      await tx.saleLine.update({
        where: { id: line.id },
        data: {
          unitCost: unit,
          costTotal: money(lineCogs.plus(share)),
          profit: money(lineProfit),
        },
      });

      cogsTotal = cogsTotal.plus(lineCogs);
      profitTotal = profitTotal.plus(lineProfit);

      if (!dropship && sale.locationId) {
        movements.push({
          itemId: line.itemId,
          locationId: sale.locationId,
          quantity: line.quantity.neg(),
          reason: "SALE",
          unitCost: unit,
          occurredAt: sale.issuedAt,
          saleId: sale.id,
          createdById: userId ?? null,
        });
      }
    }

    if (movements.length > 0) await postMovements(tx, movements);

    await tx.sale.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        cogsTotal: money(cogsTotal),
        profit: money(profitTotal),
        total: sale.subtotal,
      },
    });

    const receivable = sale.subtotal;
    if (receivable.gt(0)) {
      await tx.payment.create({
        data: {
          direction: "IN",
          partyId: sale.customerId,
          saleId: sale.id,
          amount: receivable,
          currency: sale.currency,
          fxRate: sale.fxRate,
          fxRateDate: sale.fxRateDate,
          dueDate: dueDateFor(sale.issuedAt, sale.dueDate, sale.paymentTermDays),
          status: "PENDING",
          note: `${sale.code} satış bedeli`,
          createdById: userId ?? null,
        },
      });
    }
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.sale.confirm",
    entity: "Sale",
    entityId: id,
    summary: "Satış onaylandı; stok düştü, alacak ve kâr hesaplandı",
  });
}

export async function cancelSale(id: string, userId?: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id }, include: { movements: true } });
    if (!sale) throw new DocumentError("Satış bulunamadı.");
    if (sale.status === "CANCELLED") return;

    if (sale.movements.length > 0) {
      await postMovements(
        tx,
        sale.movements.map((m) => ({
          itemId: m.itemId,
          locationId: m.locationId,
          quantity: m.quantity.neg(),
          reason: "RETURN" as const,
          unitCost: m.unitCost,
          occurredAt: new Date(),
          saleId: sale.id,
          note: `${sale.code} iptali`,
          createdById: userId ?? null,
        })),
      );
    }
    await tx.payment.updateMany({
      where: { saleId: id, status: { in: ["PENDING", "PARTIAL"] } },
      data: { status: "CANCELLED" },
    });
    // Cancelled sales must not keep contributing to profit reports.
    await tx.sale.update({
      where: { id },
      data: { status: "CANCELLED", profit: ZERO(), cogsTotal: ZERO() },
    });
    await tx.saleLine.updateMany({ where: { saleId: id }, data: { profit: ZERO() } });
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.sale.cancel",
    entity: "Sale",
    entityId: id,
    summary: "Satış iptal edildi; stok ve alacak geri alındı",
  });
}

export async function deleteSale(id: string, userId?: string | null): Promise<void> {
  const sale = await db.sale.findUnique({ where: { id }, select: { status: true, code: true } });
  if (!sale) return;
  if (sale.status !== "DRAFT") {
    throw new DocumentError("Sadece taslak satışlar silinebilir. Onaylı bir satışı iptal et.");
  }
  await db.sale.delete({ where: { id } });
  await logActivity({
    userId: userId ?? null,
    action: "os.sale.delete",
    entity: "Sale",
    entityId: id,
    summary: `Taslak satış silindi (${sale.code})`,
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSales(opts: {
  search?: string;
  customerId?: string;
  channelId?: string;
  status?: DocStatus;
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
} = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const where: Prisma.SaleWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.channelId ? { channelId: opts.channelId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.from || opts.to
      ? { issuedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {}),
    ...(opts.search?.trim()
      ? {
          OR: [
            { code: { contains: opts.search.trim(), mode: "insensitive" } },
            { customer: { name: { contains: opts.search.trim(), mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, code: true, issuedAt: true, dueDate: true, status: true, tradeModel: true,
        currency: true, fxRate: true, subtotal: true, costTotal: true, total: true,
        cogsTotal: true, profit: true,
        customer: { select: { id: true, name: true } },
        channel: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    db.sale.count({ where }),
  ]);
  return {
    total, page, perPage,
    rows: rows.map((s) => {
      const baseRevenue = toNum(s.total.mul(s.fxRate));
      const profit = toNum(s.profit);
      return {
        id: s.id,
        code: s.code,
        issuedAt: s.issuedAt,
        dueDate: s.dueDate,
        status: s.status,
        tradeModel: s.tradeModel,
        currency: s.currency,
        subtotal: toNum(s.subtotal),
        costTotal: toNum(s.costTotal),
        total: toNum(s.total),
        baseRevenue,
        cogsTotal: toNum(s.cogsTotal),
        profit,
        marginPct: baseRevenue > 0 ? (profit / baseRevenue) * 100 : null,
        customerId: s.customer?.id ?? null,
        customerName: s.customer?.name ?? null,
        channelId: s.channel?.id ?? null,
        channelName: s.channel?.name ?? null,
        lineCount: s._count.lines,
      };
    }),
  };
}

export async function getSale(id: string) {
  const s = await db.sale.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, country: true, currency: true } },
      channel: { select: { id: true, name: true, type: true, commissionRate: true } },
      location: { select: { id: true, name: true } },
      lines: { include: { item: { select: { id: true, sku: true, name: true, unit: true } } } },
      costs: true,
      payments: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!s) return null;
  const baseRevenue = toNum(s.total.mul(s.fxRate));
  const profit = toNum(s.profit);
  return {
    ...s,
    fxRate: toNum(s.fxRate),
    subtotal: toNum(s.subtotal),
    costTotal: toNum(s.costTotal),
    total: toNum(s.total),
    cogsTotal: toNum(s.cogsTotal),
    profit,
    baseRevenue,
    marginPct: baseRevenue > 0 ? (profit / baseRevenue) * 100 : null,
    lines: s.lines.map((l) => ({
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
      unitCost: toNumOrNull(l.unitCost),
      costTotal: toNum(l.costTotal),
      profit: toNum(l.profit),
      note: l.note,
    })),
    costs: s.costs.map((c) => ({
      id: c.id, kind: c.kind, label: c.label,
      amount: toNum(c.amount), currency: c.currency, fxRate: toNum(c.fxRate),
      allocation: c.allocation, note: c.note,
    })),
    payments: s.payments.map((x) => ({
      id: x.id, amount: toNum(x.amount), paidAmount: toNum(x.paidAmount),
      currency: x.currency, dueDate: x.dueDate, paidAt: x.paidAt, status: x.status, method: x.method,
    })),
  };
}

export { StockError, DocumentError, D };
