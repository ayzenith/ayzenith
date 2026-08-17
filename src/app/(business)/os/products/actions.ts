"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { createItem, deleteItemIfUnused, setChannelPrice, updateItem } from "@/server/os/items";
import { parseOptionalDecimal } from "@/server/os/money";

/** Business OS — product actions. Every one re-validates the session. */

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function itemInput(fd: FormData) {
  return {
    sku: s(fd, "sku") ?? "",
    name: s(fd, "name") ?? "",
    barcode: s(fd, "barcode"),
    category: s(fd, "category"),
    brand: s(fd, "brand"),
    unit: s(fd, "unit") ?? "adet",
    purchasePrice: parseOptionalDecimal(s(fd, "purchasePrice")),
    purchaseCurrency: s(fd, "purchaseCurrency") ?? "TRY",
    salePrice: parseOptionalDecimal(s(fd, "salePrice")),
    saleCurrency: s(fd, "saleCurrency") ?? "TRY",
    vatRate: parseOptionalDecimal(s(fd, "vatRate")),
    minStock: parseOptionalDecimal(s(fd, "minStock")),
    description: s(fd, "description"),
    notes: s(fd, "notes"),
    active: fd.get("active") !== "false",
  };
}

export async function createItemAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const input = itemInput(fd);
  if (!input.sku || !input.name) throw new Error("Stok kodu ve ürün adı zorunlu.");
  const item = await createItem(input, user.id);
  await logActivity({
    userId: user.id, action: "os.item.create", entity: "Item", entityId: item.id,
    summary: `Ürün eklendi: ${item.sku} — ${item.name}`,
  });
  revalidatePath("/os/products");
  redirect(`/os/products/${item.id}`);
}

export async function updateItemAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = s(fd, "id");
  if (!id) throw new Error("Ürün bulunamadı.");
  const input = itemInput(fd);
  if (!input.sku || !input.name) throw new Error("Stok kodu ve ürün adı zorunlu.");
  await updateItem(id, input);
  await logActivity({
    userId: user.id, action: "os.item.update", entity: "Item", entityId: id,
    summary: `Ürün güncellendi: ${input.sku}`,
  });
  revalidatePath(`/os/products/${id}`);
  redirect(`/os/products/${id}`);
}

/** Per-channel price. An empty value REMOVES the override rather than storing a
 *  zero — "no channel price" and "free on this channel" are different facts. */
export async function setChannelPriceAction(fd: FormData): Promise<void> {
  await requireUser();
  const itemId = s(fd, "itemId");
  const channelId = s(fd, "channelId");
  if (!itemId || !channelId) return;
  await setChannelPrice({
    itemId,
    channelId,
    price: parseOptionalDecimal(s(fd, "price")),
    currency: s(fd, "currency") ?? "TRY",
  });
  revalidatePath(`/os/products/${itemId}`);
}

export async function deleteItemAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  const result = await deleteItemIfUnused(id);
  await logActivity({
    userId: user.id,
    action: result.deleted ? "os.item.delete" : "os.item.archive",
    entity: "Item",
    entityId: id,
    summary: result.reason ?? "Ürün silindi",
  });
  revalidatePath("/os/products");
  redirect(result.deleted ? "/os/products" : `/os/products/${id}?msg=archived`);
}
