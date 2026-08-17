import "server-only";

import { Prisma, type PartyRoleType, type RelationStatus, type TradeModel } from "@prisma/client";
import { db } from "@/lib/db";
import { toNum, toNumOrNull } from "./money";

/**
 * AYZENITH BUSINESS OS — firms.
 *
 * One `Party` row per real company. What it DOES for you lives in
 * `PartyRelation`, keyed unique on (party, role), so the same firm can be your
 * supplier and your customer and your distributor without ever being typed
 * three times — which is exactly the duplication that makes a balance
 * meaningless.
 *
 * Every list is paginated and every rollup is a SQL aggregate. The lead list
 * pattern of loading all rows and summing them in JavaScript is fine for a
 * bounded search pool and wrong here, where sales rows grow without limit.
 */

export type PartyListRow = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  currency: string;
  active: boolean;
  roles: PartyRoleType[];
  salesTotal: number;
  openReceivable: number;
  openPayable: number;
  lastActivityAt: Date | null;
};

export type PartyListResult = { rows: PartyListRow[]; total: number; page: number; perPage: number };

export async function listParties(opts: {
  search?: string;
  role?: PartyRoleType;
  country?: string;
  active?: boolean;
  page?: number;
  perPage?: number;
} = {}): Promise<PartyListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const search = opts.search?.trim();

  const where: Prisma.PartyWhereInput = {
    ...(opts.active === undefined ? {} : { active: opts.active }),
    ...(opts.country ? { country: opts.country } : {}),
    ...(opts.role ? { relations: { some: { role: opts.role } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { legalName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { taxNumber: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.party.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, name: true, country: true, city: true, currency: true, active: true,
        relations: { select: { role: true }, orderBy: { role: "asc" } },
      },
    }),
    db.party.count({ where }),
  ]);

  if (rows.length === 0) return { rows: [], total, page, perPage };

  // One aggregate query for the whole page, not one per row.
  const ids = rows.map((r) => r.id);
  const stats = await partyStats(ids);

  return {
    rows: rows.map((r) => {
      const s = stats.get(r.id);
      return {
        id: r.id,
        name: r.name,
        country: r.country,
        city: r.city,
        currency: r.currency,
        active: r.active,
        roles: r.relations.map((x) => x.role),
        salesTotal: s?.salesTotal ?? 0,
        openReceivable: s?.openReceivable ?? 0,
        openPayable: s?.openPayable ?? 0,
        lastActivityAt: s?.lastActivityAt ?? null,
      };
    }),
    total,
    page,
    perPage,
  };
}

export type PartyStats = {
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  profitTotal: number;
  openReceivable: number;
  openPayable: number;
  lastActivityAt: Date | null;
};

/**
 * Turnover, profit and open balances for a set of firms, all in BASE currency.
 *
 * The conversion is `amount * fxRate` per row rather than one rate applied to a
 * total, because a firm you sold to in EUR last year and in USD this year has no
 * single meaningful rate. Cancelled documents are excluded; drafts too, because
 * a draft has not happened yet.
 */
export async function partyStats(partyIds: string[]): Promise<Map<string, PartyStats>> {
  const out = new Map<string, PartyStats>();
  if (partyIds.length === 0) return out;

  const rows = await db.$queryRaw<
    Array<{
      partyId: string;
      salesTotal: Prisma.Decimal | null;
      salesCount: bigint;
      profitTotal: Prisma.Decimal | null;
      purchaseTotal: Prisma.Decimal | null;
      openReceivable: Prisma.Decimal | null;
      openPayable: Prisma.Decimal | null;
      lastActivityAt: Date | null;
    }>
  >(Prisma.sql`
    WITH s AS (
      SELECT "customerId" AS "partyId",
             SUM("total" * "fxRate") AS "salesTotal",
             SUM("profit")           AS "profitTotal",
             COUNT(*)                AS "salesCount",
             MAX("issuedAt")         AS "lastSale"
      FROM "Sale"
      WHERE "customerId" = ANY(${partyIds}) AND "status" IN ('CONFIRMED','COMPLETED')
      GROUP BY "customerId"
    ),
    p AS (
      SELECT "supplierId" AS "partyId",
             SUM("total" * "fxRate") AS "purchaseTotal",
             MAX("issuedAt")         AS "lastPurchase"
      FROM "Purchase"
      WHERE "supplierId" = ANY(${partyIds}) AND "status" IN ('CONFIRMED','COMPLETED')
      GROUP BY "supplierId"
    ),
    pay AS (
      SELECT "partyId",
             SUM(CASE WHEN "direction" = 'IN'  THEN ("amount" - "paidAmount") * "fxRate" ELSE 0 END) AS "openReceivable",
             SUM(CASE WHEN "direction" = 'OUT' THEN ("amount" - "paidAmount") * "fxRate" ELSE 0 END) AS "openPayable"
      FROM "Payment"
      WHERE "partyId" = ANY(${partyIds}) AND "status" IN ('PENDING','PARTIAL')
      GROUP BY "partyId"
    )
    SELECT x."partyId",
           s."salesTotal", COALESCE(s."salesCount", 0) AS "salesCount", s."profitTotal",
           p."purchaseTotal",
           pay."openReceivable", pay."openPayable",
           GREATEST(COALESCE(s."lastSale", 'epoch'::timestamp), COALESCE(p."lastPurchase", 'epoch'::timestamp)) AS "lastActivityAt"
    FROM (SELECT UNNEST(${partyIds}::text[]) AS "partyId") x
    LEFT JOIN s   ON s."partyId"   = x."partyId"
    LEFT JOIN p   ON p."partyId"   = x."partyId"
    LEFT JOIN pay ON pay."partyId" = x."partyId"
  `);

  for (const r of rows) {
    const last = r.lastActivityAt ? new Date(r.lastActivityAt) : null;
    out.set(r.partyId, {
      salesTotal: toNum(r.salesTotal),
      salesCount: Number(r.salesCount ?? 0),
      profitTotal: toNum(r.profitTotal),
      purchaseTotal: toNum(r.purchaseTotal),
      openReceivable: toNum(r.openReceivable),
      openPayable: toNum(r.openPayable),
      lastActivityAt: last && last.getFullYear() > 1970 ? last : null,
    });
  }
  return out;
}

export async function getParty(id: string) {
  const row = await db.party.findUnique({
    where: { id },
    include: {
      relations: { orderBy: { role: "asc" } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
    },
  });
  if (!row) return null;
  const stats = (await partyStats([id])).get(id) ?? null;
  return { ...row, stats };
}

/** The last documents for a firm's detail tabs — bounded, never "all of them". */
export async function partyDocuments(partyId: string, take = 20) {
  const [sales, purchases, payments] = await Promise.all([
    db.sale.findMany({
      where: { customerId: partyId },
      orderBy: { issuedAt: "desc" },
      take,
      select: {
        id: true, code: true, issuedAt: true, status: true, currency: true,
        total: true, profit: true, channel: { select: { name: true } },
      },
    }),
    db.purchase.findMany({
      where: { supplierId: partyId },
      orderBy: { issuedAt: "desc" },
      take,
      select: { id: true, code: true, issuedAt: true, status: true, currency: true, total: true },
    }),
    db.payment.findMany({
      where: { partyId },
      orderBy: { dueDate: "asc" },
      take,
      select: {
        id: true, direction: true, amount: true, paidAmount: true, currency: true,
        dueDate: true, paidAt: true, status: true,
        sale: { select: { code: true } }, purchase: { select: { code: true } },
      },
    }),
  ]);
  return {
    sales: sales.map((s) => ({
      ...s,
      total: toNum(s.total),
      profit: toNum(s.profit),
      channelName: s.channel?.name ?? null,
    })),
    purchases: purchases.map((p) => ({ ...p, total: toNum(p.total) })),
    payments: payments.map((p) => ({
      ...p,
      amount: toNum(p.amount),
      paidAmount: toNum(p.paidAmount),
      docCode: p.sale?.code ?? p.purchase?.code ?? null,
    })),
  };
}

/** Which SKUs this firm actually buys or supplies — derived, not maintained. */
export async function partyItems(partyId: string, take = 25) {
  const rows = await db.$queryRaw<
    Array<{ itemId: string; sku: string; name: string; unit: string; soldQty: Prisma.Decimal | null; boughtQty: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT i."id" AS "itemId", i."sku", i."name", i."unit",
      SUM(CASE WHEN sl."id" IS NOT NULL THEN sl."quantity" ELSE 0 END) AS "soldQty",
      SUM(CASE WHEN pl."id" IS NOT NULL THEN pl."quantity" ELSE 0 END) AS "boughtQty"
    FROM "Item" i
    LEFT JOIN "SaleLine" sl ON sl."itemId" = i."id"
      AND sl."saleId" IN (SELECT "id" FROM "Sale" WHERE "customerId" = ${partyId} AND "status" IN ('CONFIRMED','COMPLETED'))
    LEFT JOIN "PurchaseLine" pl ON pl."itemId" = i."id"
      AND pl."purchaseId" IN (SELECT "id" FROM "Purchase" WHERE "supplierId" = ${partyId} AND "status" IN ('CONFIRMED','COMPLETED'))
    WHERE sl."id" IS NOT NULL OR pl."id" IS NOT NULL
    GROUP BY i."id"
    ORDER BY (SUM(CASE WHEN sl."id" IS NOT NULL THEN sl."quantity" ELSE 0 END)
            + SUM(CASE WHEN pl."id" IS NOT NULL THEN pl."quantity" ELSE 0 END)) DESC
    LIMIT ${take}
  `);
  return rows.map((r) => ({
    itemId: r.itemId, sku: r.sku, name: r.name, unit: r.unit,
    soldQty: toNum(r.soldQty), boughtQty: toNum(r.boughtQty),
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type PartyInput = {
  name: string;
  legalName?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  country?: string;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string;
  paymentTermDays?: number | null;
  notes?: string | null;
  active?: boolean;
  roles?: PartyRoleType[];
};

export async function createParty(input: PartyInput, userId?: string | null) {
  return db.party.create({
    data: {
      name: input.name.trim(),
      legalName: input.legalName?.trim() || null,
      taxNumber: input.taxNumber?.trim() || null,
      taxOffice: input.taxOffice?.trim() || null,
      country: (input.country || "TR").toUpperCase().slice(0, 2),
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      currency: input.currency || "TRY",
      paymentTermDays: input.paymentTermDays ?? null,
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
      createdById: userId ?? null,
      relations: input.roles?.length
        ? { create: input.roles.map((role) => ({ role, status: "ACTIVE" as RelationStatus })) }
        : undefined,
    },
  });
}

export async function updateParty(id: string, input: PartyInput) {
  return db.party.update({
    where: { id },
    data: {
      name: input.name.trim(),
      legalName: input.legalName?.trim() || null,
      taxNumber: input.taxNumber?.trim() || null,
      taxOffice: input.taxOffice?.trim() || null,
      country: (input.country || "TR").toUpperCase().slice(0, 2),
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      currency: input.currency || "TRY",
      paymentTermDays: input.paymentTermDays ?? null,
      notes: input.notes?.trim() || null,
      ...(input.active === undefined ? {} : { active: input.active }),
    },
  });
}

/** Add or update ONE commercial relationship. Upsert on (party, role) is what
 *  guarantees a firm never accumulates duplicate "Müşteri" rows. */
export async function upsertRelation(input: {
  partyId: string;
  role: PartyRoleType;
  tradeModel?: TradeModel | null;
  status?: RelationStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  note?: string | null;
}) {
  return db.partyRelation.upsert({
    where: { partyId_role: { partyId: input.partyId, role: input.role } },
    create: {
      partyId: input.partyId,
      role: input.role,
      tradeModel: input.tradeModel ?? null,
      status: input.status ?? "ACTIVE",
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      note: input.note?.trim() || null,
    },
    update: {
      tradeModel: input.tradeModel ?? null,
      status: input.status ?? "ACTIVE",
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      note: input.note?.trim() || null,
    },
  });
}

export async function removeRelation(id: string) {
  await db.partyRelation.delete({ where: { id } });
}

export async function upsertContact(input: {
  id?: string;
  partyId: string;
  firstName: string;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  note?: string | null;
}) {
  const data = {
    partyId: input.partyId,
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() || null,
    title: input.title?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    isPrimary: input.isPrimary ?? false,
    note: input.note?.trim() || null,
  };
  // Only one primary contact per firm, so "who do I call" has one answer.
  if (data.isPrimary) {
    await db.partyContact.updateMany({
      where: { partyId: input.partyId, ...(input.id ? { id: { not: input.id } } : {}) },
      data: { isPrimary: false },
    });
  }
  return input.id
    ? db.partyContact.update({ where: { id: input.id }, data })
    : db.partyContact.create({ data });
}

export async function removeContact(id: string) {
  await db.partyContact.delete({ where: { id } });
}

/**
 * Firms may only be archived, never deleted, once they carry documents —
 * removing a customer would take their sales history with it and silently
 * change last year's profit.
 */
export async function archiveParty(id: string): Promise<void> {
  await db.party.update({ where: { id }, data: { active: false } });
}

export async function deletePartyIfUnused(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const [sales, purchases, payments] = await Promise.all([
    db.sale.count({ where: { customerId: id } }),
    db.purchase.count({ where: { supplierId: id } }),
    db.payment.count({ where: { partyId: id } }),
  ]);
  if (sales + purchases + payments > 0) {
    await archiveParty(id);
    return {
      deleted: false,
      reason: `Bu firmanın ${sales} satışı, ${purchases} alışı ve ${payments} ödeme kaydı var. Silinmedi, pasife alındı.`,
    };
  }
  await db.party.delete({ where: { id } });
  return { deleted: true };
}

/** Lightweight picker source for forms (autocomplete). */
export async function searchParties(query: string, role?: PartyRoleType, take = 20) {
  const q = query.trim();
  return db.party.findMany({
    where: {
      active: true,
      ...(role ? { relations: { some: { role } } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { legalName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, country: true, city: true, currency: true, paymentTermDays: true },
  });
}

export { toNumOrNull };
