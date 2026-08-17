"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PartyRoleType, RelationStatus, TradeModel } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  archiveParty, createParty, deletePartyIfUnused, removeContact, removeRelation,
  updateParty, upsertContact, upsertRelation,
} from "@/server/os/parties";
import { transferLeadToParty } from "@/server/os/leadbridge";

/**
 * Business OS — firm actions.
 *
 * Every one starts with `requireUser()`. The Edge middleware only proves a
 * cookie exists; this is the check that re-reads the account from the database,
 * so a deactivated user cannot mutate anything by replaying a form post.
 */

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function n(fd: FormData, key: string): number | null {
  const v = s(fd, key);
  if (!v) return null;
  const parsed = Number.parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
function d(fd: FormData, key: string): Date | null {
  const v = s(fd, key);
  if (!v) return null;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function partyInput(fd: FormData) {
  return {
    name: s(fd, "name") ?? "",
    legalName: s(fd, "legalName"),
    taxNumber: s(fd, "taxNumber"),
    taxOffice: s(fd, "taxOffice"),
    country: s(fd, "country") ?? "TR",
    city: s(fd, "city"),
    address: s(fd, "address"),
    postalCode: s(fd, "postalCode"),
    website: s(fd, "website"),
    phone: s(fd, "phone"),
    email: s(fd, "email"),
    currency: s(fd, "currency") ?? "TRY",
    paymentTermDays: n(fd, "paymentTermDays"),
    notes: s(fd, "notes"),
    active: fd.get("active") !== "false",
  };
}

export async function createPartyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const input = partyInput(fd);
  if (!input.name) throw new Error("Firma adı zorunlu.");
  const roles = fd.getAll("roles").filter((r): r is string => typeof r === "string") as PartyRoleType[];
  const party = await createParty({ ...input, roles }, user.id);
  await logActivity({
    userId: user.id, action: "os.party.create", entity: "Party", entityId: party.id,
    summary: `Firma eklendi: ${party.name}`,
  });
  revalidatePath("/os/companies");
  redirect(`/os/companies/${party.id}`);
}

export async function updatePartyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = s(fd, "id");
  if (!id) throw new Error("Firma bulunamadı.");
  const input = partyInput(fd);
  if (!input.name) throw new Error("Firma adı zorunlu.");
  await updateParty(id, input);
  await logActivity({
    userId: user.id, action: "os.party.update", entity: "Party", entityId: id,
    summary: `Firma güncellendi: ${input.name}`,
  });
  revalidatePath(`/os/companies/${id}`);
  redirect(`/os/companies/${id}`);
}

export async function saveRelationAction(fd: FormData): Promise<void> {
  await requireUser();
  const partyId = s(fd, "partyId");
  const role = s(fd, "role") as PartyRoleType | null;
  if (!partyId || !role) throw new Error("Firma ve ilişki türü zorunlu.");
  await upsertRelation({
    partyId,
    role,
    tradeModel: (s(fd, "tradeModel") as TradeModel | null) ?? null,
    status: (s(fd, "status") as RelationStatus | null) ?? "ACTIVE",
    startedAt: d(fd, "startedAt"),
    endedAt: d(fd, "endedAt"),
    note: s(fd, "note"),
  });
  revalidatePath(`/os/companies/${partyId}`);
}

export async function removeRelationAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  const partyId = s(fd, "partyId");
  if (!id) return;
  await removeRelation(id);
  if (partyId) revalidatePath(`/os/companies/${partyId}`);
}

export async function saveContactAction(fd: FormData): Promise<void> {
  await requireUser();
  const partyId = s(fd, "partyId");
  const firstName = s(fd, "firstName");
  if (!partyId || !firstName) throw new Error("Firma ve ad zorunlu.");
  await upsertContact({
    id: s(fd, "id") ?? undefined,
    partyId,
    firstName,
    lastName: s(fd, "lastName"),
    title: s(fd, "title"),
    email: s(fd, "email"),
    phone: s(fd, "phone"),
    isPrimary: fd.get("isPrimary") === "on",
    note: s(fd, "note"),
  });
  revalidatePath(`/os/companies/${partyId}`);
}

export async function removeContactAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  const partyId = s(fd, "partyId");
  if (!id) return;
  await removeContact(id);
  if (partyId) revalidatePath(`/os/companies/${partyId}`);
}

/**
 * Archive, or delete when the firm carries nothing. Deleting a customer with
 * sales would take last year's profit with it, so the repository refuses and
 * archives instead — the action reports which happened rather than pretending.
 */
export async function deletePartyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  const result = await deletePartyIfUnused(id);
  await logActivity({
    userId: user.id,
    action: result.deleted ? "os.party.delete" : "os.party.archive",
    entity: "Party",
    entityId: id,
    summary: result.reason ?? "Firma silindi",
  });
  revalidatePath("/os/companies");
  redirect(result.deleted ? "/os/companies" : `/os/companies/${id}?msg=archived`);
}

export async function archivePartyAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await archiveParty(id);
  revalidatePath(`/os/companies/${id}`);
}

/** Lead Finder → Business OS. Copies; never writes back. */
export async function transferLeadAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const leadCompanyId = s(fd, "leadCompanyId");
  if (!leadCompanyId) throw new Error("Lead kaydı bulunamadı.");
  const role = (s(fd, "role") as PartyRoleType | null) ?? "CUSTOMER";
  const result = await transferLeadToParty(leadCompanyId, { role, userId: user.id });
  revalidatePath("/os/companies");
  redirect(`/os/companies/${result.partyId}`);
}
