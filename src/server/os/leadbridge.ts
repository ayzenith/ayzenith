import "server-only";

import type { PartyRoleType } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";

/**
 * AYZENITH — the bridge from Lead Finder to Business OS.
 *
 * RADAR → pazar seçimi → LEAD FINDER → aday firma → BUSINESS OS → ticari ilişki
 * → satış → tahsilat → kâr. This module is the single hop in the middle, and it
 * is deliberately one-way and lossy-by-copy.
 *
 * WHY IT COPIES RATHER THAN REFERENCES
 *
 * `LeadCompany` belongs to the discovery pipeline. It is scoped to a search, it
 * is rewritten when that search is re-run, and the same firm found by two
 * searches is legitimately two rows. If a customer record pointed at it by
 * foreign key, re-running a search could rewrite a customer's address, or a
 * cleanup could cascade into invoiced history.
 *
 * So the transfer READS Lead Finder and WRITES Business OS. It never writes back.
 * `Party.leadCompanyId` is a plain string — no FK, no cascade, no constraint —
 * which means Lead Finder can do anything it likes to its own tables afterwards
 * and no operational record moves.
 *
 * NOTHING IN THIS FILE MUTATES LEAD FINDER OR RADAR.
 */

export type TransferResult = {
  partyId: string;
  created: boolean;
  contactsCopied: number;
  message: string;
};

/** Has this lead already been brought across? Drives the button's state. */
export async function findPartyForLead(leadCompanyId: string): Promise<{ id: string; name: string } | null> {
  return db.party.findFirst({
    where: { leadCompanyId },
    select: { id: true, name: true },
  });
}

export async function findPartiesForLeads(leadCompanyIds: string[]): Promise<Map<string, string>> {
  if (leadCompanyIds.length === 0) return new Map();
  const rows = await db.party.findMany({
    where: { leadCompanyId: { in: leadCompanyIds } },
    select: { id: true, leadCompanyId: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) if (r.leadCompanyId) out.set(r.leadCompanyId, r.id);
  return out;
}

/**
 * Copy one discovered company into Business OS as a real firm.
 *
 * Deduplication runs before creating: an already-transferred lead returns its
 * existing party, and a firm that matches by domain or by name+country is reused
 * rather than duplicated — the same firm arriving from two different searches
 * must not become two customers.
 */
export async function transferLeadToParty(
  leadCompanyId: string,
  opts: { role?: PartyRoleType; userId?: string | null } = {},
): Promise<TransferResult> {
  const lead = await db.leadCompany.findUnique({
    where: { id: leadCompanyId },
    include: {
      contacts: { orderBy: { confidence: "desc" }, take: 10 },
      search: { select: { id: true, country: true, productQuery: true } },
    },
  });
  if (!lead) throw new Error("Lead Finder kaydı bulunamadı.");

  const role: PartyRoleType = opts.role ?? "CUSTOMER";

  const already = await db.party.findFirst({
    where: { leadCompanyId },
    select: { id: true, name: true },
  });
  if (already) {
    await ensureRole(already.id, role);
    return {
      partyId: already.id,
      created: false,
      contactsCopied: 0,
      message: `"${already.name}" zaten Business OS'ta kayıtlı. İlişki güncellendi.`,
    };
  }

  // Same firm, different search: match on website domain first (the strongest
  // key Lead Finder has), then on name + country.
  const existing = await db.party.findFirst({
    where: {
      OR: [
        ...(lead.domain ? [{ website: { contains: lead.domain, mode: "insensitive" as const } }] : []),
        { name: { equals: lead.name, mode: "insensitive" as const }, country: lead.country },
      ],
    },
    select: { id: true, name: true },
  });

  if (existing) {
    await db.party.update({
      where: { id: existing.id },
      data: { leadCompanyId: lead.id, leadSearchId: lead.searchId, importedAt: new Date() },
    });
    await ensureRole(existing.id, role);
    await logActivity({
      userId: opts.userId ?? null,
      action: "os.lead.link",
      entity: "Party",
      entityId: existing.id,
      summary: `Lead Finder kaydı mevcut firmayla eşleştirildi: ${existing.name}`,
    });
    return {
      partyId: existing.id,
      created: false,
      contactsCopied: 0,
      message: `"${existing.name}" zaten kayıtlıydı; Lead Finder kaydıyla eşleştirildi.`,
    };
  }

  const party = await db.party.create({
    data: {
      name: lead.name,
      legalName: lead.legalName,
      country: lead.country,
      city: lead.city,
      address: lead.address,
      postalCode: lead.postalCode,
      website: lead.website,
      phone: lead.phone,
      email: lead.email,
      // Country default only — never guessed from the lead, which has no
      // currency field. The owner sets it on the first document.
      currency: lead.country === "TR" ? "TRY" : "EUR",
      leadCompanyId: lead.id,
      leadSearchId: lead.searchId,
      importedAt: new Date(),
      createdById: opts.userId ?? null,
      notes: buildProvenanceNote(lead),
      relations: { create: [{ role, status: "PROSPECT" }] },
      contacts: {
        create: lead.contacts
          .filter((c) => c.firstName || c.lastName)
          .map((c) => ({
            firstName: c.firstName ?? "—",
            lastName: c.lastName,
            // Only a VERIFIED role is copied as a title. An unverified guess
            // would arrive in the operational record looking like a fact.
            title: c.roleVerified ? c.role : null,
            email: c.corporateEmail,
            note: c.sourceUrl ? `Kaynak: ${c.sourceUrl}` : null,
          })),
      },
    },
    select: { id: true, name: true, _count: { select: { contacts: true } } },
  });

  await logActivity({
    userId: opts.userId ?? null,
    action: "os.lead.transfer",
    entity: "Party",
    entityId: party.id,
    summary: `Lead Finder'dan aktarıldı: ${party.name}`,
  });

  return {
    partyId: party.id,
    created: true,
    contactsCopied: party._count.contacts,
    message: `"${party.name}" Business OS'a aktarıldı.`,
  };
}

/** Bulk transfer from the Lead Finder list. Failures are reported, not thrown. */
export async function transferLeads(
  leadCompanyIds: string[],
  opts: { role?: PartyRoleType; userId?: string | null } = {},
): Promise<{ created: number; linked: number; failed: number; messages: string[] }> {
  let created = 0, linked = 0, failed = 0;
  const messages: string[] = [];
  for (const id of leadCompanyIds) {
    try {
      const r = await transferLeadToParty(id, opts);
      if (r.created) created += 1;
      else linked += 1;
    } catch (e) {
      failed += 1;
      messages.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { created, linked, failed, messages };
}

async function ensureRole(partyId: string, role: PartyRoleType): Promise<void> {
  await db.partyRelation.upsert({
    where: { partyId_role: { partyId, role } },
    create: { partyId, role, status: "PROSPECT" },
    update: {},
  });
}

function buildProvenanceNote(lead: {
  discoveredVia: string;
  leadScore: number | null;
  search: { country: string; productQuery: string } | null;
  domain: string | null;
}): string {
  const parts = ["Lead Finder'dan aktarıldı."];
  if (lead.search) parts.push(`Arama: ${lead.search.country} · ${lead.search.productQuery}`);
  if (lead.leadScore != null) parts.push(`Aktarım anındaki lead skoru: ${lead.leadScore}`);
  if (lead.domain) parts.push(`Alan adı: ${lead.domain}`);
  return parts.join(" ");
}

/**
 * The lead a firm came from, for the Party detail screen. Read-only, and
 * tolerant of the row having been deleted or rewritten since — the link is
 * informational, so a missing lead is a blank panel, never an error.
 */
export async function leadOriginFor(partyId: string) {
  const party = await db.party.findUnique({
    where: { id: partyId },
    select: { leadCompanyId: true, leadSearchId: true, importedAt: true },
  });
  if (!party?.leadCompanyId) return null;
  const lead = await db.leadCompany.findUnique({
    where: { id: party.leadCompanyId },
    select: {
      id: true, name: true, leadScore: true, leadConfidence: true, status: true,
      domain: true, discoveredVia: true,
      search: { select: { id: true, countryLabel: true, productQuery: true } },
    },
  });
  return {
    importedAt: party.importedAt,
    searchId: party.leadSearchId,
    lead,
    /** Present even when `lead` is null — the origin is still a fact. */
    leadCompanyId: party.leadCompanyId,
  };
}
