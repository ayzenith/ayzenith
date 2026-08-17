"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CostAllocation, CostKind } from "@prisma/client";
import { requireUser } from "@/server/auth";
import {
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  deletePurchase,
  type CostLineInput,
  type PurchaseLineInput,
} from "@/server/os/purchases";
import { parseDecimal, parseOptionalDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function linesFrom(fd: FormData): PurchaseLineInput[] {
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

function costsFrom(fd: FormData): CostLineInput[] {
  const kinds = fd.getAll("costKind").map(String);
  const labels = fd.getAll("costLabel").map(String);
  const amounts = fd.getAll("costAmount").map(String);
  const currencies = fd.getAll("costCurrency").map(String);
  const fxRates = fd.getAll("costFxRate").map(String);
  const allocations = fd.getAll("costAllocation").map(String);
  return kinds
    .map((kind, i) => ({
      kind: kind as CostKind,
      label: labels[i] || null,
      amount: parseDecimal(amounts[i]),
      currency: currencies[i] || "TRY",
      fxRate: parseDecimal(fxRates[i] || "1"),
      allocation: (allocations[i] as CostAllocation) || "BY_VALUE",
    }))
    .filter((c) => c.amount.gt(0));
}

export async function createPurchaseAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const supplierId = s(fd, "supplierId");
  if (!supplierId) throw new Error("Tedarikçi seçmelisin.");
  const lines = linesFrom(fd);
  if (lines.length === 0) throw new Error("En az bir ürün satırı seçmelisin.");
  const id = await createPurchase(
    {
      supplierId,
      locationId: s(fd, "locationId"),
      issuedAt: s(fd, "issuedAt") ? new Date(s(fd, "issuedAt")!) : undefined,
      currency: s(fd, "currency") ?? "TRY",
      fxRate: parseDecimal(s(fd, "fxRate") ?? "1"),
      status: s(fd, "status") === "DRAFT" ? "DRAFT" : "CONFIRMED",
      note: s(fd, "note"),
      lines,
      costs: costsFrom(fd),
    },
    u.id,
  );
  revalidatePath("/os/purchases");
  redirect(`/os/purchases/${id}`);
}

export async function purchaseAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const kind = fd.get("kind");
  if (kind === "confirm") await confirmPurchase(id, u.id);
  if (kind === "cancel") await cancelPurchase(id, u.id);
  if (kind === "delete") await deletePurchase(id, u.id);
  revalidatePath("/os/purchases");
  redirect(kind === "delete" ? "/os/purchases" : `/os/purchases/${id}`);
}
