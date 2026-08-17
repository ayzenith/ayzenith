"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TradeModel } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { cancelSale, confirmSale, createSale, deleteSale, type SaleLineInput } from "@/server/os/sales";
import { priceFor } from "@/server/os/items";
import { parseDecimal, parseOptionalDecimal, toNumOrNull } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function linesFrom(fd: FormData): SaleLineInput[] {
  const itemIds = fd.getAll("lineItemId").map(String);
  const quantities = fd.getAll("lineQuantity").map(String);
  const unitPrices = fd.getAll("lineUnitPrice").map(String);
  const discountRates = fd.getAll("lineDiscountRate").map(String);
  const vatRates = fd.getAll("lineVatRate").map(String);
  return itemIds
    .map((itemId, i) => ({
      itemId,
      quantity: parseDecimal(quantities[i]),
      unitPrice: parseDecimal(unitPrices[i]),
      discountRate: parseOptionalDecimal(discountRates[i]) ?? undefined,
      vatRate: parseOptionalDecimal(vatRates[i]) ?? undefined,
    }))
    .filter((l) => l.itemId);
}

export async function createSaleAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const lines = linesFrom(fd);
  if (lines.length === 0) throw new Error("En az bir ürün satırı seçmelisin.");
  const id = await createSale(
    {
      customerId: s(fd, "customerId"),
      channelId: s(fd, "channelId"),
      locationId: s(fd, "locationId"),
      issuedAt: s(fd, "issuedAt") ? new Date(s(fd, "issuedAt")!) : undefined,
      currency: s(fd, "currency") ?? "TRY",
      fxRate: parseDecimal(s(fd, "fxRate") ?? "1"),
      status: s(fd, "status") === "DRAFT" ? "DRAFT" : "CONFIRMED",
      tradeModel: (s(fd, "tradeModel") as TradeModel | null) ?? null,
      note: s(fd, "note"),
      lines,
    },
    u.id,
  );
  revalidatePath("/os/sales");
  redirect(`/os/sales/${id}`);
}

export async function saleAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const kind = fd.get("kind");
  if (kind === "confirm") await confirmSale(id, u.id);
  if (kind === "cancel") await cancelSale(id, u.id);
  if (kind === "delete") await deleteSale(id, u.id);
  revalidatePath("/os/sales");
  redirect(kind === "delete" ? "/os/sales" : `/os/sales/${id}`);
}

/** Wraps `priceFor` for the client-side form: pick a channel, see its price. */
export async function priceForAction(itemId: string, channelId: string): Promise<{ price: number | null; currency: string }> {
  await requireUser();
  if (!itemId) return { price: null, currency: "TRY" };
  const { price, currency } = await priceFor(itemId, channelId || null);
  return { price: toNumOrNull(price), currency };
}
