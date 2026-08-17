"use server";

import { revalidatePath } from "next/cache";
import type { StockLocationType } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { deleteLocationIfEmpty, upsertLocation } from "@/server/os/channels";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function upsertLocationAction(fd: FormData): Promise<void> {
  await requireUser();
  const name = s(fd, "name");
  if (!name) throw new Error("Konum adı zorunlu.");
  await upsertLocation({
    name,
    type: (s(fd, "type") as StockLocationType) ?? "WAREHOUSE",
    country: s(fd, "country"),
    city: s(fd, "city"),
    isDefault: fd.get("isDefault") === "on",
  });
  revalidatePath("/os/inventory/locations");
}

export async function deactivateLocationAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await deleteLocationIfEmpty(id);
  revalidatePath("/os/inventory/locations");
}
