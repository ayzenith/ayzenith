"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { runImportAnalysis, type ImportAnalysisInput, type MoneyInput } from "@/server/import/analyze";
import { checkSourceChanges } from "@/server/import/sources";
import type { OriginProof } from "@/server/import/origin";
import { lookupCountry } from "@/server/import/countries";
import { db } from "@/lib/db";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function n(fd: FormData, key: string): number | null {
  const raw = s(fd, key);
  if (!raw) return null;
  const v = Number(raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

function cash(fd: FormData, key: string, fallbackCurrency: string): MoneyInput {
  return { amount: n(fd, key), currency: (s(fd, `${key}Currency`) ?? fallbackCurrency).toUpperCase() };
}

export async function analyzeImportAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const productName = s(fd, "productName");
  if (!productName) throw new Error("Ürün adı zorunludur.");
  const currency = (s(fd, "currency") ?? "EUR").toUpperCase();
  const atrRaw = s(fd, "atr");

  const input: ImportAnalysisInput = {
    productName,
    description: s(fd, "description"),
    specText: s(fd, "specText"),
    urls: [s(fd, "url1"), s(fd, "url2"), s(fd, "url3")].filter((u): u is string => !!u),
    brand: s(fd, "brand"),
    model: s(fd, "model"),
    mpn: s(fd, "mpn"),
    ean: s(fd, "ean"),
    condition: (s(fd, "condition") as ImportAnalysisInput["condition"]) ?? null,
    itemId: s(fd, "itemId"),
    supplierId: s(fd, "supplierId"),
    gtipMode: s(fd, "gtipMode") === "USER" ? "USER" : "PREDICT",
    userGtip: s(fd, "userGtip"),
    btbRef: s(fd, "btbRef"),
    originCountry: lookupCountry(s(fd, "originCountry")),
    dispatchCountry: lookupCountry(s(fd, "dispatchCountry")),
    dispatchCity: s(fd, "dispatchCity"),
    atr: atrRaw === "YES" ? true : atrRaw === "NO" ? false : null,
    originProof: (s(fd, "originProof") as OriginProof | null) ?? null,
    importDate: s(fd, "importDate") ? new Date(`${s(fd, "importDate")}T00:00:00Z`) : new Date(),
    quantity: n(fd, "quantity"),
    unit: s(fd, "unit") ?? "adet",
    unitPrice: n(fd, "unitPrice"),
    currency,
    incoterm: s(fd, "incoterm"),
    freight: cash(fd, "freight", currency),
    insurance: cash(fd, "insurance", currency),
    broker: cash(fd, "broker", "TRY"),
    handling: cash(fd, "handling", "TRY"),
    other: cash(fd, "other", "TRY"),
    weightKg: n(fd, "weightKg"),
    volumeM3: n(fd, "volumeM3"),
    pallets: n(fd, "pallets"),
    shipmentType: s(fd, "shipmentType") === "FTL" ? "FTL" : "LTL",
    destCity: s(fd, "destCity") ?? "Istanbul",
    salePrice: cash(fd, "salePrice", "TRY"),
  };

  const { caseId } = await runImportAnalysis(input, { persist: true, userId: user.id });
  revalidatePath("/os/import");
  redirect(`/os/import/${caseId}`);
}

export async function checkImportSourcesAction(): Promise<void> {
  await requireUser();
  await checkSourceChanges();
  revalidatePath("/os/import/sources");
}

export async function deleteImportCaseAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (id) await db.importCase.delete({ where: { id } });
  revalidatePath("/os/import");
  redirect("/os/import");
}
