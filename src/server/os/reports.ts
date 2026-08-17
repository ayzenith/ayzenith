import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNum } from "./money";

/**
 * AYZENITH BUSINESS OS — reports.
 *
 * Eight reports, one shape: a filter in, typed rows out, every figure computed
 * by Postgres in base currency via `amount * fxRate`. Nothing here paginates,
 * because a report is meant to be read whole and exported — but every one is
 * bounded by a date range, and the aggregates run on indexed columns.
 *
 * These functions are also exactly what the Excel exporter consumes, so the
 * spreadsheet and the screen can never disagree.
 */

export type ReportFilter = {
  from?: Date;
  to?: Date;
  partyId?: string;
  itemId?: string;
  channelId?: string;
  country?: string;
  currency?: string;
};

function range(f: ReportFilter): { from: Date; to: Date } {
  const to = f.to ?? new Date();
  const from = f.from ?? new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from, to };
}

// ---------------------------------------------------------------------------

export type SalesReportRow = {
  code: string;
  issuedAt: Date;
  customerName: string | null;
  channelName: string | null;
  country: string | null;
  currency: string;
  total: number;
  baseRevenue: number;
  cogs: number;
  directCost: number;
  profit: number;
  marginPct: number | null;
  status: string;
};

export async function salesReport(f: ReportFilter): Promise<{ rows: SalesReportRow[]; totals: { revenue: number; cogs: number; cost: number; profit: number } }> {
  const { from, to } = range(f);
  const rows = await db.sale.findMany({
    where: {
      status: { in: ["CONFIRMED", "COMPLETED"] },
      issuedAt: { gte: from, lte: to },
      ...(f.partyId ? { customerId: f.partyId } : {}),
      ...(f.channelId ? { channelId: f.channelId } : {}),
      ...(f.currency ? { currency: f.currency } : {}),
      ...(f.country ? { customer: { country: f.country } } : {}),
      ...(f.itemId ? { lines: { some: { itemId: f.itemId } } } : {}),
    },
    orderBy: { issuedAt: "desc" },
    select: {
      code: true, issuedAt: true, currency: true, fxRate: true, total: true,
      cogsTotal: true, costTotal: true, profit: true, status: true,
      customer: { select: { name: true, country: true } },
      channel: { select: { name: true } },
    },
  });

  let revenue = 0, cogs = 0, cost = 0, profit = 0;
  const out = rows.map((s) => {
    const baseRevenue = toNum(s.total.mul(s.fxRate));
    const c = toNum(s.cogsTotal);
    const dc = toNum(s.costTotal.mul(s.fxRate));
    const p = toNum(s.profit);
    revenue += baseRevenue; cogs += c; cost += dc; profit += p;
    return {
      code: s.code,
      issuedAt: s.issuedAt,
      customerName: s.customer?.name ?? null,
      channelName: s.channel?.name ?? null,
      country: s.customer?.country ?? null,
      currency: s.currency,
      total: toNum(s.total),
      baseRevenue,
      cogs: c,
      directCost: dc,
      profit: p,
      marginPct: baseRevenue > 0 ? (p / baseRevenue) * 100 : null,
      status: s.status,
    };
  });
  return { rows: out, totals: { revenue, cogs, cost, profit } };
}

// ---------------------------------------------------------------------------

export type PurchaseReportRow = {
  code: string;
  issuedAt: Date;
  supplierName: string;
  country: string;
  currency: string;
  subtotal: number;
  costTotal: number;
  total: number;
  baseTotal: number;
  status: string;
};

export async function purchaseReport(f: ReportFilter): Promise<{ rows: PurchaseReportRow[]; totals: { goods: number; costs: number; total: number } }> {
  const { from, to } = range(f);
  const rows = await db.purchase.findMany({
    where: {
      status: { in: ["CONFIRMED", "COMPLETED"] },
      issuedAt: { gte: from, lte: to },
      ...(f.partyId ? { supplierId: f.partyId } : {}),
      ...(f.currency ? { currency: f.currency } : {}),
      ...(f.country ? { supplier: { country: f.country } } : {}),
      ...(f.itemId ? { lines: { some: { itemId: f.itemId } } } : {}),
    },
    orderBy: { issuedAt: "desc" },
    select: {
      code: true, issuedAt: true, currency: true, fxRate: true,
      subtotal: true, costTotal: true, total: true, status: true,
      supplier: { select: { name: true, country: true } },
    },
  });
  let goods = 0, costs = 0, total = 0;
  const out = rows.map((p) => {
    const baseTotal = toNum(p.total.mul(p.fxRate));
    goods += toNum(p.subtotal.mul(p.fxRate));
    costs += toNum(p.costTotal.mul(p.fxRate));
    total += baseTotal;
    return {
      code: p.code,
      issuedAt: p.issuedAt,
      supplierName: p.supplier.name,
      country: p.supplier.country,
      currency: p.currency,
      subtotal: toNum(p.subtotal),
      costTotal: toNum(p.costTotal),
      total: toNum(p.total),
      baseTotal,
      status: p.status,
    };
  });
  return { rows: out, totals: { goods, costs, total } };
}

// ---------------------------------------------------------------------------

export type ProfitByItemRow = {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
};

/** Profit per SKU — the report that answers "hangi ürün gerçekten kazandırıyor". */
export async function profitByItem(f: ReportFilter): Promise<ProfitByItemRow[]> {
  const { from, to } = range(f);
  const rows = await db.$queryRaw<
    Array<{
      itemId: string; sku: string; name: string; unit: string;
      qty: Prisma.Decimal | null; revenue: Prisma.Decimal | null;
      cost: Prisma.Decimal | null; profit: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT i."id" AS "itemId", i."sku", i."name", i."unit",
           SUM(sl."quantity")               AS "qty",
           SUM(sl."lineTotal" * s."fxRate") AS "revenue",
           SUM(sl."costTotal")              AS "cost",
           SUM(sl."profit")                 AS "profit"
    FROM "SaleLine" sl
    JOIN "Sale" s ON s."id" = sl."saleId"
    JOIN "Item" i ON i."id" = sl."itemId"
    WHERE s."status" IN ('CONFIRMED','COMPLETED')
      AND s."issuedAt" BETWEEN ${from} AND ${to}
      ${f.channelId ? Prisma.sql`AND s."channelId" = ${f.channelId}` : Prisma.empty}
      ${f.partyId ? Prisma.sql`AND s."customerId" = ${f.partyId}` : Prisma.empty}
      ${f.itemId ? Prisma.sql`AND sl."itemId" = ${f.itemId}` : Prisma.empty}
    GROUP BY i."id"
    ORDER BY "profit" DESC NULLS LAST
  `);
  return rows.map((r) => {
    const revenue = toNum(r.revenue);
    const profit = toNum(r.profit);
    return {
      itemId: r.itemId, sku: r.sku, name: r.name, unit: r.unit,
      qty: toNum(r.qty), revenue, cost: toNum(r.cost), profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    };
  });
}

// ---------------------------------------------------------------------------

export type PartyReportRow = {
  partyId: string;
  name: string;
  country: string;
  salesCount: number;
  revenue: number;
  profit: number;
  marginPct: number | null;
  openReceivable: number;
};

export async function customerReport(f: ReportFilter): Promise<PartyReportRow[]> {
  const { from, to } = range(f);
  const rows = await db.$queryRaw<
    Array<{
      partyId: string; name: string; country: string; salesCount: bigint;
      revenue: Prisma.Decimal | null; profit: Prisma.Decimal | null; open: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT p."id" AS "partyId", p."name", p."country",
           COUNT(s."id")                   AS "salesCount",
           SUM(s."total" * s."fxRate")     AS "revenue",
           SUM(s."profit")                 AS "profit",
           (SELECT SUM((pm."amount" - pm."paidAmount") * pm."fxRate") FROM "Payment" pm
             WHERE pm."partyId" = p."id" AND pm."direction" = 'IN' AND pm."status" IN ('PENDING','PARTIAL')) AS "open"
    FROM "Sale" s
    JOIN "Party" p ON p."id" = s."customerId"
    WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" BETWEEN ${from} AND ${to}
      ${f.country ? Prisma.sql`AND p."country" = ${f.country}` : Prisma.empty}
    GROUP BY p."id"
    ORDER BY "revenue" DESC NULLS LAST
  `);
  return rows.map((r) => {
    const revenue = toNum(r.revenue);
    const profit = toNum(r.profit);
    return {
      partyId: r.partyId, name: r.name, country: r.country,
      salesCount: Number(r.salesCount), revenue, profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
      openReceivable: toNum(r.open),
    };
  });
}

export type SupplierReportRow = {
  partyId: string;
  name: string;
  country: string;
  purchaseCount: number;
  total: number;
  openPayable: number;
};

export async function supplierReport(f: ReportFilter): Promise<SupplierReportRow[]> {
  const { from, to } = range(f);
  const rows = await db.$queryRaw<
    Array<{ partyId: string; name: string; country: string; cnt: bigint; total: Prisma.Decimal | null; open: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT p."id" AS "partyId", p."name", p."country",
           COUNT(pu."id")                  AS "cnt",
           SUM(pu."total" * pu."fxRate")   AS "total",
           (SELECT SUM((pm."amount" - pm."paidAmount") * pm."fxRate") FROM "Payment" pm
             WHERE pm."partyId" = p."id" AND pm."direction" = 'OUT' AND pm."status" IN ('PENDING','PARTIAL')) AS "open"
    FROM "Purchase" pu
    JOIN "Party" p ON p."id" = pu."supplierId"
    WHERE pu."status" IN ('CONFIRMED','COMPLETED') AND pu."issuedAt" BETWEEN ${from} AND ${to}
      ${f.country ? Prisma.sql`AND p."country" = ${f.country}` : Prisma.empty}
    GROUP BY p."id"
    ORDER BY "total" DESC NULLS LAST
  `);
  return rows.map((r) => ({
    partyId: r.partyId, name: r.name, country: r.country,
    purchaseCount: Number(r.cnt), total: toNum(r.total), openPayable: toNum(r.open),
  }));
}

// ---------------------------------------------------------------------------

export type ChannelReportRow = {
  channelId: string | null;
  name: string;
  type: string | null;
  salesCount: number;
  revenue: number;
  cogs: number;
  commission: number;
  profit: number;
  marginPct: number | null;
};

export async function channelReport(f: ReportFilter): Promise<ChannelReportRow[]> {
  const { from, to } = range(f);
  const rows = await db.$queryRaw<
    Array<{
      channelId: string | null; name: string | null; type: string | null; cnt: bigint;
      revenue: Prisma.Decimal | null; cogs: Prisma.Decimal | null;
      commission: Prisma.Decimal | null; profit: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT s."channelId", c."name", c."type"::text AS "type",
           COUNT(s."id")                   AS "cnt",
           SUM(s."total" * s."fxRate")     AS "revenue",
           SUM(s."cogsTotal")              AS "cogs",
           SUM(s."profit")                 AS "profit",
           (SELECT COALESCE(SUM(cl."amount" * cl."fxRate"), 0) FROM "CostLine" cl
              JOIN "Sale" s2 ON s2."id" = cl."saleId"
              WHERE cl."kind" = 'COMMISSION'
                AND s2."channelId" IS NOT DISTINCT FROM s."channelId"
                AND s2."status" IN ('CONFIRMED','COMPLETED')
                AND s2."issuedAt" BETWEEN ${from} AND ${to}) AS "commission"
    FROM "Sale" s
    LEFT JOIN "Channel" c ON c."id" = s."channelId"
    WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" BETWEEN ${from} AND ${to}
    GROUP BY s."channelId", c."name", c."type"
    ORDER BY "revenue" DESC NULLS LAST
  `);
  return rows.map((r) => {
    const revenue = toNum(r.revenue);
    const profit = toNum(r.profit);
    return {
      channelId: r.channelId,
      name: r.name ?? "Kanalsız",
      type: r.type,
      salesCount: Number(r.cnt),
      revenue,
      cogs: toNum(r.cogs),
      commission: toNum(r.commission),
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    };
  });
}

// ---------------------------------------------------------------------------

export type CashflowReportRow = {
  month: string;
  incoming: number;
  outgoing: number;
  net: number;
};

/** Twelve months forward and back, by due date — the nakit akışı report. */
export async function cashflowReport(f: ReportFilter): Promise<CashflowReportRow[]> {
  const to = f.to ?? (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d; })();
  const from = f.from ?? (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d; })();
  const rows = await db.$queryRaw<
    Array<{ month: string; incoming: Prisma.Decimal | null; outgoing: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT TO_CHAR(DATE_TRUNC('month', "dueDate"), 'YYYY-MM') AS "month",
           SUM(CASE WHEN "direction" = 'IN'  THEN ("amount" - "paidAmount") * "fxRate" ELSE 0 END) AS "incoming",
           SUM(CASE WHEN "direction" = 'OUT' THEN ("amount" - "paidAmount") * "fxRate" ELSE 0 END) AS "outgoing"
    FROM "Payment"
    WHERE "status" IN ('PENDING','PARTIAL') AND "dueDate" BETWEEN ${from} AND ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  return rows.map((r) => {
    const incoming = toNum(r.incoming);
    const outgoing = toNum(r.outgoing);
    return { month: r.month, incoming, outgoing, net: incoming - outgoing };
  });
}

// ---------------------------------------------------------------------------

export type StockReportRow = {
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  onHand: number;
  avgCost: number | null;
  value: number;
  minStock: number | null;
  low: boolean;
};

export async function stockReport(): Promise<{ rows: StockReportRow[]; totalValue: number }> {
  const rows = await db.$queryRaw<
    Array<{
      sku: string; name: string; unit: string; category: string | null;
      onHand: Prisma.Decimal | null; avgCost: Prisma.Decimal | null; minStock: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT i."sku", i."name", i."unit", i."category", i."minStock",
           COALESCE(SUM(m."quantity"), 0) AS "onHand",
           CASE WHEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END) > 0
                THEN SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" * m."unitCost" ELSE 0 END)
                     / SUM(CASE WHEN m."quantity" > 0 AND m."unitCost" IS NOT NULL THEN m."quantity" ELSE 0 END)
                ELSE NULL END AS "avgCost"
    FROM "Item" i
    LEFT JOIN "StockMovement" m ON m."itemId" = i."id"
    WHERE i."active" = true
    GROUP BY i."id"
    ORDER BY i."name" ASC
  `);
  let totalValue = 0;
  const out = rows.map((r) => {
    const onHand = toNum(r.onHand);
    const avgCost = r.avgCost ? toNum(r.avgCost) : null;
    const minStock = r.minStock ? toNum(r.minStock) : null;
    const value = avgCost != null ? onHand * avgCost : 0;
    totalValue += value;
    return {
      sku: r.sku, name: r.name, unit: r.unit, category: r.category,
      onHand, avgCost, value, minStock,
      low: minStock != null && onHand <= minStock,
    };
  });
  return { rows: out, totalValue };
}

/** Country list for report filters, derived from the firms that actually exist. */
export async function reportCountries(): Promise<string[]> {
  const rows = await db.party.findMany({
    distinct: ["country"],
    select: { country: true },
    orderBy: { country: "asc" },
  });
  return rows.map((r) => r.country);
}
