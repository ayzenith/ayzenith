"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  setContactStatus,
  updateContactNotes,
  deleteContactMessage,
} from "@/server/contact";
import type { ContactStatusValue } from "@/config/contact-labels";

/** Contact inbox mutations. Admin-only surface; no public impact. */

const STATUSES: ContactStatusValue[] = ["NEW", "READ", "ARCHIVED"];

export async function setContactStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  const status = (formData.get("status") as string | null)?.trim() as ContactStatusValue;
  if (!id || !STATUSES.includes(status)) return;

  await setContactStatus(id, status);
  await logActivity({
    userId: user.id,
    action: "contact.status",
    entity: "contact",
    entityId: id,
    summary: `Mesaj durumu: ${status}`,
  });
  revalidatePath("/admin/contacts");
  revalidatePath(`/admin/contacts/${id}`);
}

export async function saveContactNotesAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  const notes = (formData.get("notes") as string | null) ?? "";
  if (!id) return;

  await updateContactNotes(id, notes);
  await logActivity({
    userId: user.id,
    action: "contact.notes",
    entity: "contact",
    entityId: id,
    summary: "Mesaja not eklendi",
  });
  revalidatePath(`/admin/contacts/${id}`);
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  await deleteContactMessage(id);
  await logActivity({
    userId: user.id,
    action: "contact.delete",
    entity: "contact",
    entityId: id,
    summary: "Mesaj silindi",
  });
  revalidatePath("/admin/contacts");
  redirect("/admin/contacts");
}
