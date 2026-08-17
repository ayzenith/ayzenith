"use server";

import { revalidatePath } from "next/cache";
import type { TaxStatus } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { deleteTaxRecord, markTaxPaid, upsertTaxRecord } from "@/server/os/finance";
import { parseOptionalDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function upsertTaxAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const kind = s(fd, "kind");
  const period = s(fd, "period");
  const dueDate = s(fd, "dueDate");
  if (!kind || !period || !dueDate) throw new Error("Tür, dönem ve vade zorunlu.");
  await upsertTaxRecord({
    kind,
    period,
    amount: parseOptionalDecimal(s(fd, "amount")),
    currency: s(fd, "currency") ?? "TRY",
    dueDate: new Date(dueDate),
    status: (s(fd, "status") as TaxStatus) ?? "PLANNED",
    note: s(fd, "note"),
    userId: u.id,
  });
  revalidatePath("/os/tax");
}

export async function markTaxPaidAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await markTaxPaid(id, new Date(), u.id);
  revalidatePath("/os/tax");
}

export async function deleteTaxAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await deleteTaxRecord(id);
  revalidatePath("/os/tax");
}
