"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TradeDocType } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { saveOsSettings, saveCompanyProfile } from "@/server/os/settings";
import { seedStarterChannels } from "@/server/os/channels";
import { CURRENCY_CODES } from "@/config/os";
import { createMediaFromUpload } from "@/server/media";
import {
  createSignatory, updateSignatory, deleteSignatory, seedDefaultSignatory,
} from "@/server/os/signatories";
import {
  createBankAccount, updateBankAccount, deleteBankAccount,
} from "@/server/os/bank-accounts";
import { db } from "@/lib/db";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function saveSettingsAction(fd: FormData): Promise<void> {
  await requireUser();
  const baseCurrency = String(fd.get("baseCurrency") || "TRY");
  const fxRates: Record<string, number> = {};
  for (const code of CURRENCY_CODES) {
    if (code === baseCurrency) continue;
    const raw = fd.get(`fx_${code}`);
    const n = raw ? Number.parseFloat(String(raw).replace(",", ".")) : NaN;
    if (Number.isFinite(n) && n > 0) fxRates[code] = n;
  }
  await saveOsSettings({
    baseCurrency,
    defaultCountry: String(fd.get("defaultCountry") || "TR").toUpperCase().slice(0, 2),
    allowNegativeStock: fd.get("allowNegativeStock") === "on",
    fxRates,
  });
  revalidatePath("/os/settings");
}

export async function seedChannelsAction(): Promise<void> {
  await requireUser();
  await seedStarterChannels();
  revalidatePath("/os/settings");
  revalidatePath("/os/channels");
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export async function saveCompanyProfileAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  let logoUrl: string | undefined;
  const file = fd.get("logo");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await createMediaFromUpload({ bytes, originalName: file.name, mime: file.type, userId: u.id });
    logoUrl = asset.url;
  }
  await saveCompanyProfile({
    companyLegalName: str(fd, "companyLegalName") ?? "",
    companyTradingName: str(fd, "companyTradingName") ?? "",
    companyAddress: str(fd, "companyAddress") ?? "",
    companyCountry: str(fd, "companyCountry") ?? "",
    companyCity: str(fd, "companyCity") ?? "",
    companyPostalCode: str(fd, "companyPostalCode") ?? "",
    companyPhone: str(fd, "companyPhone") ?? "",
    companyEmail: str(fd, "companyEmail") ?? "",
    companyWebsite: str(fd, "companyWebsite") ?? "",
    companyTaxNumber: str(fd, "companyTaxNumber") ?? "",
    companyVatNumber: str(fd, "companyVatNumber") ?? "",
    companyChamberReg: str(fd, "companyChamberReg") ?? "",
    ...(logoUrl ? { companyLogoUrl: logoUrl } : {}),
    defaultDocLanguage: (str(fd, "defaultDocLanguage") as "TR" | "EN" | "DE" | null) ?? undefined,
    defaultDocFooterNote: str(fd, "defaultDocFooterNote") ?? "",
  });
  revalidatePath("/os/settings");
  redirect("/os/settings?tab=firma");
}

// ---------------------------------------------------------------------------
// Signatories
// ---------------------------------------------------------------------------

const ALL_DOC_TYPES: TradeDocType[] = ["QUOTATION", "PROFORMA_INVOICE", "COMMERCIAL_INVOICE", "PACKING_LIST"];

export async function addSignatoryAction(fd: FormData): Promise<void> {
  await requireUser();
  await createSignatory({
    firstName: str(fd, "firstName") ?? "",
    lastName: str(fd, "lastName"),
    jobTitle: str(fd, "jobTitle"),
    department: str(fd, "department"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    isDefault: fd.get("isDefault") === "on",
    supportedDocTypes: ALL_DOC_TYPES,
  });
  revalidatePath("/os/settings");
  redirect("/os/settings?tab=imza");
}

export async function updateSignatoryAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  let signatureUrl: string | undefined;
  const file = fd.get("signature");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await createMediaFromUpload({ bytes, originalName: file.name, mime: file.type, userId: u.id });
    signatureUrl = asset.url;
  }
  const existing = await db.companySignatory.findUnique({ where: { id } });
  await updateSignatory(id, {
    firstName: str(fd, "firstName") ?? existing?.firstName ?? "",
    lastName: str(fd, "lastName"),
    jobTitle: str(fd, "jobTitle"),
    department: str(fd, "department"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    signatureUrl: signatureUrl ?? existing?.signatureUrl ?? null,
    active: fd.get("active") === "on",
    isDefault: fd.get("isDefault") === "on",
    supportedDocTypes: ALL_DOC_TYPES,
  });
  revalidatePath("/os/settings");
  redirect("/os/settings?tab=imza");
}

export async function deleteSignatoryAction(fd: FormData): Promise<void> {
  await requireUser();
  await deleteSignatory(String(fd.get("id") || ""));
  revalidatePath("/os/settings");
}

export async function seedSignatoryAction(): Promise<void> {
  await requireUser();
  await seedDefaultSignatory();
  revalidatePath("/os/settings");
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

export async function addBankAccountAction(fd: FormData): Promise<void> {
  await requireUser();
  await createBankAccount({
    bankName: str(fd, "bankName") ?? "",
    accountHolder: str(fd, "accountHolder") ?? "",
    iban: str(fd, "iban"),
    swift: str(fd, "swift"),
    currency: str(fd, "currency") ?? "EUR",
    country: str(fd, "country"),
    isDefault: fd.get("isDefault") === "on",
  });
  revalidatePath("/os/settings");
  redirect("/os/settings?tab=banka");
}

export async function updateBankAccountAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = String(fd.get("id") || "");
  await updateBankAccount(id, {
    bankName: str(fd, "bankName") ?? "",
    accountHolder: str(fd, "accountHolder") ?? "",
    iban: str(fd, "iban"),
    swift: str(fd, "swift"),
    currency: str(fd, "currency") ?? "EUR",
    country: str(fd, "country"),
    active: fd.get("active") === "on",
    isDefault: fd.get("isDefault") === "on",
  });
  revalidatePath("/os/settings");
  redirect("/os/settings?tab=banka");
}

export async function deleteBankAccountAction(fd: FormData): Promise<void> {
  await requireUser();
  await deleteBankAccount(String(fd.get("id") || ""));
  revalidatePath("/os/settings");
}
