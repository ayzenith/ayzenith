"use server";

import { revalidatePath } from "next/cache";
import type { StockMoveReason } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { adjustStock, transferStock } from "@/server/os/inventory";
import { parseDecimal, parseOptionalDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function transferStockAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const itemId = s(fd, "itemId");
  const fromLocationId = s(fd, "fromLocationId");
  const toLocationId = s(fd, "toLocationId");
  if (!itemId || !fromLocationId || !toLocationId) throw new Error("Ürün, kaynak ve hedef konum zorunlu.");
  await transferStock({
    itemId,
    fromLocationId,
    toLocationId,
    quantity: parseDecimal(s(fd, "quantity")),
    note: s(fd, "note"),
    userId: u.id,
  });
  revalidatePath("/os/inventory");
}

export async function adjustStockAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const itemId = s(fd, "itemId");
  const locationId = s(fd, "locationId");
  if (!itemId || !locationId) throw new Error("Ürün ve konum zorunlu.");
  const signed = s(fd, "direction") === "OUT" ? parseDecimal(s(fd, "quantity")).neg() : parseDecimal(s(fd, "quantity"));
  await adjustStock({
    itemId,
    locationId,
    quantity: signed,
    reason: (s(fd, "reason") as StockMoveReason) ?? "ADJUSTMENT",
    unitCost: parseOptionalDecimal(s(fd, "unitCost")),
    note: s(fd, "note"),
    userId: u.id,
  });
  revalidatePath("/os/inventory");
}
