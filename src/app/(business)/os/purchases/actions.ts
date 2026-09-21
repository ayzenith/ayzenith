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
import { getOsSettings, type OsSettings } from "@/server/os/settings";
import { resolveFxRate } from "@/server/os/fx";
import { linkImportCaseToPurchase } from "@/server/import/purchase-link";

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

/** Each cost line carries its own currency, so each gets its own rate — the one
 *  typed on the form, or the TCMB rate for the document date. Never a silent 1. */
async function costsFrom(fd: FormData, issuedAt: Date, settings: OsSettings): Promise<CostLineInput[]> {
  const kinds = fd.getAll("costKind").map(String);
  const labels = fd.getAll("costLabel").map(String);
  const amounts = fd.getAll("costAmount").map(String);
  const currencies = fd.getAll("costCurrency").map(String);
  const fxRates = fd.getAll("costFxRate").map(String);
  const allocations = fd.getAll("costAllocation").map(String);
  const out: CostLineInput[] = [];
  for (let i = 0; i < kinds.length; i += 1) {
    const amount = parseDecimal(amounts[i]);
    if (!amount.gt(0)) continue;
    const currency = currencies[i] || settings.baseCurrency;
    const fx = await resolveFxRate({ currency, date: issuedAt, given: fxRates[i], settings });
    out.push({
      kind: kinds[i] as CostKind,
      label: labels[i] || null,
      amount,
      currency,
      fxRate: fx.rate,
      allocation: (allocations[i] as CostAllocation) || "BY_VALUE",
    });
  }
  return out;
}

export async function createPurchaseAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const supplierId = s(fd, "supplierId");
  if (!supplierId) throw new Error("Tedarikçi seçmelisin.");
  const lines = linesFrom(fd);
  if (lines.length === 0) throw new Error("En az bir ürün satırı seçmelisin.");
  const settings = await getOsSettings();
  const issuedAt = s(fd, "issuedAt") ? new Date(s(fd, "issuedAt")!) : new Date();
  const currency = s(fd, "currency") ?? settings.baseCurrency;
  const fx = await resolveFxRate({ currency, date: issuedAt, given: s(fd, "fxRate"), settings });
  const costs = await costsFrom(fd, issuedAt, settings);
  const id = await createPurchase(
    {
      supplierId,
      locationId: s(fd, "locationId"),
      issuedAt,
      currency,
      fxRate: fx.rate,
      fxRateDate: fx.fxRateDate,
      status: s(fd, "status") === "DRAFT" ? "DRAFT" : "CONFIRMED",
      note: s(fd, "note"),
      lines,
      costs,
    },
    u.id,
  );
  const importCaseId = s(fd, "importCaseId");
  if (importCaseId) await linkImportCaseToPurchase(importCaseId, id);
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
