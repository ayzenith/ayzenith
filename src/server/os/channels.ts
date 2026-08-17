import "server-only";

import { Prisma, type ChannelType, type StockLocationType } from "@prisma/client";
import { db } from "@/lib/db";
import { toNum, toNumOrNull, type Dec } from "./money";

/**
 * AYZENITH BUSINESS OS — sales channels and stock locations.
 *
 * A channel is where a sale happens; a location is where the goods sit. They are
 * separate because they do not always line up: two marketplaces can ship from
 * one warehouse, and one marketplace can hold its own stock. When a channel DOES
 * hold stock (a Trendyol fulfilment centre), `StockLocation.channelId` ties them
 * together, and `ensureChannelLocation` creates that pairing on demand.
 *
 * `externalKey` and `commissionRate` are the two fields a future marketplace
 * integration needs. They exist now so switching one on is configuration, not a
 * migration — but nothing in V1 calls an external API.
 */

export type ChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
  commissionRate: number | null;
  currency: string;
  partyId: string | null;
  partyName: string | null;
  active: boolean;
  note: string | null;
  salesCount: number;
  revenue: number;
  profit: number;
  commissionCost: number;
};

/** Channels with their realised performance — the channel comparison screen. */
export async function listChannels(opts: { activeOnly?: boolean } = {}): Promise<ChannelRow[]> {
  const channels = await db.channel.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, type: true, commissionRate: true, currency: true,
      active: true, note: true, partyId: true, party: { select: { name: true } },
    },
  });
  if (channels.length === 0) return [];

  const perf = await channelPerformance();
  return channels.map((c) => {
    const p = perf.get(c.id);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      commissionRate: toNumOrNull(c.commissionRate),
      currency: c.currency,
      partyId: c.partyId,
      partyName: c.party?.name ?? null,
      active: c.active,
      note: c.note,
      salesCount: p?.salesCount ?? 0,
      revenue: p?.revenue ?? 0,
      profit: p?.profit ?? 0,
      commissionCost: p?.commissionCost ?? 0,
    };
  });
}

export type ChannelPerf = { salesCount: number; revenue: number; profit: number; commissionCost: number };

/** Revenue, profit and commission paid per channel, in BASE currency. */
export async function channelPerformance(range?: { from?: Date; to?: Date }): Promise<Map<string, ChannelPerf>> {
  const from = range?.from ?? new Date(0);
  // Not JS's actual max date (year 275760): Prisma's raw-query parameter
  // serializer cannot round-trip that value and throws "Could not convert
  // from JSON date object to PrismaValue". Any far-future sentinel works for
  // an unbounded "to" filter — this one just stays inside what Prisma can send.
  const to = range?.to ?? new Date("2999-12-31T23:59:59.999Z");
  const rows = await db.$queryRaw<
    Array<{
      channelId: string | null;
      salesCount: bigint;
      revenue: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      commissionCost: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT s."channelId",
           COUNT(*)                       AS "salesCount",
           SUM(s."total" * s."fxRate")    AS "revenue",
           SUM(s."profit")                AS "profit",
           COALESCE((
             SELECT SUM(c."amount" * c."fxRate")
             FROM "CostLine" c
             WHERE c."saleId" IN (
               SELECT s2."id" FROM "Sale" s2
               WHERE s2."channelId" IS NOT DISTINCT FROM s."channelId"
                 AND s2."status" IN ('CONFIRMED','COMPLETED')
                 AND s2."issuedAt" BETWEEN ${from} AND ${to}
             ) AND c."kind" = 'COMMISSION'
           ), 0) AS "commissionCost"
    FROM "Sale" s
    WHERE s."status" IN ('CONFIRMED','COMPLETED') AND s."issuedAt" BETWEEN ${from} AND ${to}
    GROUP BY s."channelId"
  `);
  const out = new Map<string, ChannelPerf>();
  for (const r of rows) {
    if (!r.channelId) continue;
    out.set(r.channelId, {
      salesCount: Number(r.salesCount),
      revenue: toNum(r.revenue),
      profit: toNum(r.profit),
      commissionCost: toNum(r.commissionCost),
    });
  }
  return out;
}

export async function getChannel(id: string) {
  const c = await db.channel.findUnique({
    where: { id },
    select: {
      id: true, name: true, type: true, commissionRate: true, currency: true,
      partyId: true, externalKey: true, active: true, note: true,
      party: { select: { id: true, name: true } },
      stockLocations: { select: { id: true, name: true, type: true } },
    },
  });
  if (!c) return null;
  return { ...c, commissionRate: toNumOrNull(c.commissionRate) };
}

export async function upsertChannel(input: {
  id?: string;
  name: string;
  type: ChannelType;
  commissionRate?: Dec | null;
  currency?: string;
  partyId?: string | null;
  externalKey?: string | null;
  active?: boolean;
  note?: string | null;
}) {
  const data = {
    name: input.name.trim(),
    type: input.type,
    commissionRate: input.commissionRate ?? null,
    currency: input.currency || "TRY",
    partyId: input.partyId || null,
    externalKey: input.externalKey?.trim() || null,
    note: input.note?.trim() || null,
    ...(input.active === undefined ? {} : { active: input.active }),
  };
  return input.id
    ? db.channel.update({ where: { id: input.id }, data })
    : db.channel.create({ data });
}

export async function deleteChannelIfUnused(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const sales = await db.sale.count({ where: { channelId: id } });
  if (sales > 0) {
    await db.channel.update({ where: { id }, data: { active: false } });
    return { deleted: false, reason: `Bu kanalda ${sales} satış var. Silinmedi, pasife alındı.` };
  }
  await db.channel.delete({ where: { id } });
  return { deleted: true };
}

/**
 * Get (or create) the stock location that belongs to a channel. Called when the
 * owner splits stock across marketplaces — "10 Trendyol, 10 Amazon" needs two
 * real places for the ledger to point at.
 */
export async function ensureChannelLocation(channelId: string): Promise<string> {
  const existing = await db.stockLocation.findFirst({
    where: { channelId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { name: true } });
  const created = await db.stockLocation.create({
    data: {
      name: channel?.name ?? `Kanal ${channelId.slice(0, 6)}`,
      type: "CHANNEL",
      channelId,
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// Stock locations
// ---------------------------------------------------------------------------

export async function upsertLocation(input: {
  id?: string;
  name: string;
  type: StockLocationType;
  channelId?: string | null;
  partyId?: string | null;
  country?: string | null;
  city?: string | null;
  isDefault?: boolean;
  active?: boolean;
  note?: string | null;
}) {
  const data = {
    name: input.name.trim(),
    type: input.type,
    channelId: input.channelId || null,
    partyId: input.partyId || null,
    country: input.country?.trim() || null,
    city: input.city?.trim() || null,
    note: input.note?.trim() || null,
    ...(input.active === undefined ? {} : { active: input.active }),
  };
  const row = input.id
    ? await db.stockLocation.update({ where: { id: input.id }, data })
    : await db.stockLocation.create({ data });

  // Exactly one default, so "where did the goods land" always has an answer.
  if (input.isDefault) {
    await db.stockLocation.updateMany({ where: { id: { not: row.id } }, data: { isDefault: false } });
    await db.stockLocation.update({ where: { id: row.id }, data: { isDefault: true } });
  }
  return row;
}

export async function deleteLocationIfEmpty(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const moves = await db.stockMovement.count({ where: { locationId: id } });
  if (moves > 0) {
    await db.stockLocation.update({ where: { id }, data: { active: false } });
    return { deleted: false, reason: `Bu konumda ${moves} stok hareketi var. Silinmedi, pasife alındı.` };
  }
  await db.stockLocation.delete({ where: { id } });
  return { deleted: true };
}

/**
 * The starter set. Called once, from the settings screen, so a brand-new install
 * is usable in one click instead of asking the owner to invent a warehouse.
 */
export async function seedStarterChannels(): Promise<{ channels: number; locations: number }> {
  const wanted: Array<{ name: string; type: ChannelType; commissionRate: number | null }> = [
    { name: "Manuel satış", type: "MANUAL", commissionRate: null },
    { name: "AYZENITH Web", type: "OWN_WEBSITE", commissionRate: null },
    { name: "Trendyol", type: "MARKETPLACE", commissionRate: 21 },
    { name: "Amazon", type: "MARKETPLACE", commissionRate: 15 },
    { name: "Fiziksel mağaza", type: "PHYSICAL_STORE", commissionRate: null },
    { name: "B2B", type: "B2B", commissionRate: null },
  ];
  let channels = 0;
  for (const w of wanted) {
    const exists = await db.channel.findUnique({ where: { name: w.name }, select: { id: true } });
    if (exists) continue;
    await db.channel.create({
      data: { name: w.name, type: w.type, commissionRate: w.commissionRate },
    });
    channels += 1;
  }
  let locations = 0;
  const anyLocation = await db.stockLocation.findFirst({ select: { id: true } });
  if (!anyLocation) {
    await db.stockLocation.create({ data: { name: "Ana Depo", type: "WAREHOUSE", isDefault: true } });
    locations += 1;
  }
  return { channels, locations };
}
