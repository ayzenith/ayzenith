"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseKind, RecurrenceFreq } from "@prisma/client";
import { requireUser } from "@/server/auth";
import {
  createExpense,
  deleteExpense,
  deleteRecurring,
  upsertRecurring,
} from "@/server/os/finance";
import { parseDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function createExpenseAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const title = s(fd, "title");
  if (!title) throw new Error("Gider başlığı zorunlu.");
  await createExpense({
    title,
    kind: (s(fd, "kind") as ExpenseKind) ?? "OTHER",
    partyId: s(fd, "partyId"),
    amount: parseDecimal(s(fd, "amount")),
    currency: s(fd, "currency") ?? "TRY",
    fxRate: parseDecimal(s(fd, "fxRate") ?? "1"),
    occurredAt: s(fd, "occurredAt") ? new Date(s(fd, "occurredAt")!) : undefined,
    dueDate: s(fd, "dueDate") ? new Date(s(fd, "dueDate")!) : undefined,
    note: s(fd, "note"),
    userId: user.id,
  });
  revalidatePath("/os/expenses");
  redirect("/os/expenses");
}

export async function deleteExpenseAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await deleteExpense(id, user.id);
  revalidatePath("/os/expenses");
}

export async function upsertRecurringAction(fd: FormData): Promise<void> {
  await requireUser();
  const title = s(fd, "title");
  if (!title) throw new Error("Gider başlığı zorunlu.");
  await upsertRecurring({
    title,
    kind: (s(fd, "kind") as ExpenseKind) ?? "OTHER",
    partyId: s(fd, "partyId"),
    amount: parseDecimal(s(fd, "amount")),
    currency: s(fd, "currency") ?? "TRY",
    frequency: (s(fd, "frequency") as RecurrenceFreq) ?? "MONTHLY",
    dayOfMonth: Number.parseInt(s(fd, "dayOfMonth") ?? "1", 10) || 1,
    startsAt: s(fd, "startsAt") ? new Date(s(fd, "startsAt")!) : new Date(),
    note: s(fd, "note"),
  });
  revalidatePath("/os/expenses");
  redirect("/os/expenses");
}

export async function deleteRecurringAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await deleteRecurring(id);
  revalidatePath("/os/expenses");
}
