import "server-only";

import type { TradeDocType } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_SIGNATORY } from "@/config/trade-documents";

/**
 * Authorised signatories for outgoing trade documents. A document copies the
 * printed name/title at generation time (`TradeDocument.signatoryName` /
 * `signatoryTitle`), so editing a title here never rewrites a past PDF.
 */

export async function listSignatories(opts: { activeOnly?: boolean } = {}) {
  const rows = await db.companySignatory.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows;
}

export async function getSignatory(id: string) {
  return db.companySignatory.findUnique({ where: { id } });
}

export async function getDefaultSignatory() {
  return db.companySignatory.findFirst({ where: { active: true, isDefault: true } })
    ?? db.companySignatory.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

export type SignatoryInput = {
  firstName: string;
  lastName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  signatureUrl?: string | null;
  signatureDisplayName?: string | null;
  active?: boolean;
  isDefault?: boolean;
  supportedDocTypes?: TradeDocType[];
};

export async function createSignatory(input: SignatoryInput): Promise<string> {
  if (!input.firstName.trim()) throw new Error("İsim gerekli.");
  if (input.isDefault) await db.companySignatory.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  const row = await db.companySignatory.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      department: input.department?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      signatureUrl: input.signatureUrl || null,
      signatureDisplayName: input.signatureDisplayName?.trim() || null,
      active: input.active ?? true,
      isDefault: input.isDefault ?? false,
      supportedDocTypes: input.supportedDocTypes ?? [],
    },
  });
  return row.id;
}

export async function updateSignatory(id: string, input: SignatoryInput): Promise<void> {
  if (input.isDefault) await db.companySignatory.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
  await db.companySignatory.update({
    where: { id },
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      department: input.department?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      signatureUrl: input.signatureUrl || null,
      signatureDisplayName: input.signatureDisplayName?.trim() || null,
      active: input.active ?? true,
      isDefault: input.isDefault ?? false,
      supportedDocTypes: input.supportedDocTypes ?? [],
    },
  });
}

export async function deleteSignatory(id: string): Promise<void> {
  await db.companySignatory.delete({ where: { id } });
}

/** Seeds the example signatory from the brief — a no-op if one already exists. */
export async function seedDefaultSignatory(): Promise<void> {
  const count = await db.companySignatory.count();
  if (count > 0) return;
  await db.companySignatory.create({
    data: {
      firstName: DEFAULT_SIGNATORY.firstName,
      lastName: DEFAULT_SIGNATORY.lastName,
      jobTitle: DEFAULT_SIGNATORY.jobTitle,
      email: DEFAULT_SIGNATORY.email,
      phone: DEFAULT_SIGNATORY.phone,
      active: true,
      isDefault: true,
      supportedDocTypes: ["QUOTATION", "PROFORMA_INVOICE", "COMMERCIAL_INVOICE", "PACKING_LIST"],
    },
  });
}
