import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNum } from "./money";
import { getOsSettings } from "./settings";
import { getCashflow, startOfDay, type CashflowView } from "./finance";
import { stockSummary } from "./inventory";

/**
 * AYZENITH BUSINESS OS — the cockpit.
 *
 * Everything here is a SQL aggregate over a bounded date range. Nothing loads a
 * table into memory, because this page is the one screen that will be opened
 * every morning for years and must not get slower as the business grows.
 *
 * The "bugün dikkat etmen gerekenler" list is deliberately derived, never
 * stored: an alert that has to be recalculated by a job is an alert that is
 * wrong between jobs.
 */

export type MonthTotals = {
  revenue: number;
  cogs: number;
  directCost: number;
  grossProfit: number;
  marginPct: number | null;
  salesCount: number;
  purchaseTotal: number;
  expenseTotal: number;
};

export type AttentionItem = {
  level: "critical" | "warning" | "info" | "ok";
  label: string;
  href: string;
  count: number;
};

export type OsDashboard = {
  baseCurrency: string;
  month: MonthTotals;
  prevMonth: MonthTotals;
  cashflow: CashflowView;
  stock: { value: number; lowCount: number; skuCount: number };
  counts: { parties: number; items: number; channels: number; openSales: number; draftDocs: number };
  attention: AttentionItem[];
  topChannels: Array<{ id: string; name: string; revenue: number; profit: number }>;
  recentSales: Array<{ id: string; code: string; issuedAt: Date; partyName: string | null; total: number; currency: string; profit: number; status: string }>;
  configured: boolean;
};

function monthRange(offset = 0): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from, to };
}

async function totalsFor(from: Date, to: Date): Promise<MonthTotals> {
  const rows = await db.$queryRaw<
    Array<{
      revenue: Prisma.Decimal | null;
      cogs: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      salesCount: bigint;
      directCost: Prisma.Decimal | null;
      purchaseTotal: Prisma.Decimal | null;
      expenseTotal: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT
      (SELECT SUM(s."total" * s."fxRate") FROM "Sale" s
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${from} AND s."issuedAt" < ${to}) AS "revenue",
      (SELECT SUM(s."cogsTotal") FROM "Sale" s
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${from} AND s."issuedAt" < ${to}) AS "cogs",
      (SELECT SUM(s."profit") FROM "Sale" s
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${from} AND s."issuedAt" < ${to}) AS "profit",
      (SELECT COUNT(*) FROM "Sale" s
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${from} AND s."issuedAt" < ${to}) AS "salesCount",
      (SELECT SUM(c."amount" * c."fxRate") FROM "CostLine" c
        JOIN "Sale" s ON s."id" = c."saleId"
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${from} AND s."issuedAt" < ${to}) AS "directCost",
      (SELECT SUM(p."total" * p."fxRate") FROM "Purchase" p
        WHERE p."status" IN ('CONFIRMED','COMPLETED') AND p."issuedAt" >= ${from} AND p."issuedAt" < ${to}) AS "purchaseTotal",
      (SELECT SUM(e."amount" * e."fxRate") FROM "Expense" e
        WHERE e."occurredAt" >= ${from} AND e."occurredAt" < ${to}) AS "expenseTotal"
  `);
  const r = rows[0];
  const revenue = toNum(r?.revenue ?? null);
  const grossProfit = toNum(r?.profit ?? null);
  return {
    revenue,
    cogs: toNum(r?.cogs ?? null),
    directCost: toNum(r?.directCost ?? null),
    grossProfit,
    marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : null,
    salesCount: Number(r?.salesCount ?? 0),
    purchaseTotal: toNum(r?.purchaseTotal ?? null),
    expenseTotal: toNum(r?.expenseTotal ?? null),
  };
}

export async function getOsDashboard(): Promise<OsDashboard> {
  const settings = await getOsSettings();
  const cur = monthRange(0);
  const prev = monthRange(-1);
  const today = startOfDay();
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const [
    month, prevMonth, cashflow, stock,
    parties, items, channels, openSales, draftDocs,
    overdueIn, overdueOut, dueSoon, topChannelRows, recentSales,
  ] = await Promise.all([
    totalsFor(cur.from, cur.to),
    totalsFor(prev.from, prev.to),
    getCashflow(settings.baseCurrency),
    stockSummary(),
    db.party.count({ where: { active: true } }),
    db.item.count({ where: { active: true } }),
    db.channel.count({ where: { active: true } }),
    db.sale.count({ where: { status: "CONFIRMED" } }),
    db.sale.count({ where: { status: "DRAFT" } }).then(async (s) =>
      s + (await db.purchase.count({ where: { status: "DRAFT" } })),
    ),
    db.payment.count({ where: { direction: "IN", status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lt: today } } }),
    db.payment.count({ where: { direction: "OUT", status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lt: today } } }),
    db.payment.count({ where: { direction: "OUT", status: { in: ["PENDING", "PARTIAL"] }, dueDate: { gte: today, lte: in7 } } }),
    db.$queryRaw<Array<{ id: string; name: string; revenue: Prisma.Decimal | null; profit: Prisma.Decimal | null }>>(
      Prisma.sql`
        SELECT c."id", c."name",
               SUM(s."total" * s."fxRate") AS "revenue",
               SUM(s."profit")             AS "profit"
        FROM "Sale" s
        JOIN "Channel" c ON c."id" = s."channelId"
        WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" >= ${cur.from} AND s."issuedAt" < ${cur.to}
        GROUP BY c."id"
        ORDER BY "revenue" DESC NULLS LAST
        LIMIT 5
      `,
    ),
    db.sale.findMany({
      orderBy: { issuedAt: "desc" },
      take: 6,
      select: {
        id: true, code: true, issuedAt: true, total: true, currency: true, profit: true, status: true,
        customer: { select: { name: true } }, channel: { select: { name: true } },
      },
    }),
  ]);

  const attention: AttentionItem[] = [];
  if (overdueIn > 0) {
    attention.push({ level: "critical", label: `${overdueIn} gecikmiş tahsilat`, href: "/os/payments?direction=IN&overdue=1", count: overdueIn });
  }
  if (overdueOut > 0) {
    attention.push({ level: "critical", label: `${overdueOut} gecikmiş ödeme`, href: "/os/payments?direction=OUT&overdue=1", count: overdueOut });
  }
  if (dueSoon > 0) {
    attention.push({ level: "warning", label: `${dueSoon} ödeme 7 gün içinde`, href: "/os/payments?direction=OUT", count: dueSoon });
  }
  if (stock.lowCount > 0) {
    attention.push({ level: "warning", label: `${stock.lowCount} üründe düşük stok`, href: "/os/inventory?low=1", count: stock.lowCount });
  }
  if (draftDocs > 0) {
    attention.push({ level: "info", label: `${draftDocs} taslak belge onay bekliyor`, href: "/os/sales?status=DRAFT", count: draftDocs });
  }
  if (openSales > 0) {
    attention.push({ level: "info", label: `${openSales} açık satış`, href: "/os/sales?status=CONFIRMED", count: openSales });
  }
  if (attention.length === 0) {
    attention.push({ level: "ok", label: "Bugün acil bir şey yok", href: "/os", count: 0 });
  }

  return {
    baseCurrency: settings.baseCurrency,
    month,
    prevMonth,
    cashflow,
    stock,
    counts: { parties, items, channels, openSales, draftDocs },
    attention,
    topChannels: topChannelRows.map((c) => ({
      id: c.id, name: c.name, revenue: toNum(c.revenue), profit: toNum(c.profit),
    })),
    recentSales: recentSales.map((s) => ({
      id: s.id,
      code: s.code,
      issuedAt: s.issuedAt,
      partyName: s.customer?.name ?? s.channel?.name ?? null,
      total: toNum(s.total),
      currency: s.currency,
      profit: toNum(s.profit),
      status: s.status,
    })),
    // Drives the first-run guidance instead of showing a wall of zeroes with no
    // explanation of what to do next.
    configured: parties > 0 || items > 0,
  };
}
