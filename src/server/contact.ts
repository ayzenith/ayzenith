import "server-only";

import { db } from "@/lib/db";
import type { ContactInput } from "@/lib/validation/contact";
import type { ContactStatusValue } from "@/config/contact-labels";

/**
 * Contact inquiry repository — persistence for the public form's submissions and
 * the CMS inbox. `saveContactMessage` is called from the API route (additively,
 * so nothing about the public form contract changes); the rest powers the admin
 * inbox at /admin/contacts.
 */

export type ContactMessageDTO = {
  id: string;
  name: string;
  company: string;
  email: string;
  region: string;
  interest: string;
  message: string;
  status: ContactStatusValue;
  notes: string | null;
  createdAt: Date;
};

function toDTO(row: {
  id: string;
  name: string;
  company: string;
  email: string;
  region: string;
  interest: string;
  message: string;
  status: string;
  notes: string | null;
  createdAt: Date;
}): ContactMessageDTO {
  return { ...row, status: row.status as ContactStatusValue };
}

/** Persist a validated inquiry. Best-effort: never throws to the caller so a
 *  storage hiccup can't break the public form submission. Returns id or null. */
export async function saveContactMessage(input: ContactInput): Promise<string | null> {
  try {
    const row = await db.contactMessage.create({
      data: {
        name: input.name,
        company: input.company,
        email: input.email,
        region: input.region,
        interest: input.interest,
        message: input.message,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[contact] failed to persist message:", e);
    return null;
  }
}

export async function listContactMessages(
  status?: ContactStatusValue,
): Promise<ContactMessageDTO[]> {
  const rows = await db.contactMessage.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDTO);
}

export async function getContactMessage(id: string): Promise<ContactMessageDTO | null> {
  const row = await db.contactMessage.findUnique({ where: { id } });
  return row ? toDTO(row) : null;
}

export async function setContactStatus(
  id: string,
  status: ContactStatusValue,
): Promise<void> {
  await db.contactMessage.update({ where: { id }, data: { status } });
}

export async function updateContactNotes(id: string, notes: string): Promise<void> {
  await db.contactMessage.update({ where: { id }, data: { notes: notes.slice(0, 4000) } });
}

export async function deleteContactMessage(id: string): Promise<void> {
  await db.contactMessage.delete({ where: { id } });
}

export async function countContactsByStatus(): Promise<{
  total: number;
  unread: number;
}> {
  const [total, unread] = await Promise.all([
    db.contactMessage.count(),
    db.contactMessage.count({ where: { status: "NEW" } }),
  ]);
  return { total, unread };
}

/** All messages as CSV rows (for export). */
export async function contactMessagesCsv(): Promise<string> {
  const rows = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
  const header = ["Tarih", "Ad", "Firma", "E-posta", "Bölge", "İlgi", "Durum", "Mesaj"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.name,
      r.company,
      r.email,
      r.region,
      r.interest,
      r.status,
      r.message.replace(/\r?\n/g, " "),
    ]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\r\n");
}
