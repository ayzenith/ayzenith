"use server";

import { revalidatePath } from "next/cache";
import type { PaymentDirection, PaymentMethod } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { cancelPayment, createPayment, settlePayment } from "@/server/os/finance";
import { parseDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function settlePaymentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await settlePayment({
    id,
    amount: parseDecimal(s(fd, "amount")),
    paidAt: s(fd, "paidAt") ? new Date(s(fd, "paidAt")!) : undefined,
    method: (s(fd, "method") as PaymentMethod | null) ?? null,
    reference: s(fd, "reference"),
    userId: u.id,
  });
  revalidatePath("/os/payments");
}

export async function createPaymentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const dueDate = s(fd, "dueDate");
  if (!dueDate) throw new Error("Vade tarihi zorunlu.");
  await createPayment({
    direction: (s(fd, "direction") as PaymentDirection) ?? "IN",
    partyId: s(fd, "partyId"),
    amount: parseDecimal(s(fd, "amount")),
    currency: s(fd, "currency") ?? "TRY",
    fxRate: parseDecimal(s(fd, "fxRate") ?? "1"),
    dueDate: new Date(dueDate),
    method: (s(fd, "method") as PaymentMethod | null) ?? null,
    note: s(fd, "note"),
    userId: u.id,
  });
  revalidatePath("/os/payments");
}

export async function cancelPaymentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await cancelPayment(id, u.id);
  revalidatePath("/os/payments");
}
