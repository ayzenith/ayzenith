import "server-only";

import { db } from "@/lib/db";

/** Company bank accounts a trade document can quote — one document picks one. */

export async function listBankAccounts(opts: { activeOnly?: boolean } = {}) {
  return db.companyBankAccount.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function getBankAccount(id: string) {
  return db.companyBankAccount.findUnique({ where: { id } });
}

export async function getDefaultBankAccount(currency?: string) {
  if (currency) {
    const match = await db.companyBankAccount.findFirst({ where: { active: true, currency } });
    if (match) return match;
  }
  return db.companyBankAccount.findFirst({ where: { active: true, isDefault: true } })
    ?? db.companyBankAccount.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

export type BankAccountInput = {
  bankName: string;
  accountHolder: string;
  iban?: string | null;
  swift?: string | null;
  currency: string;
  country?: string | null;
  active?: boolean;
  isDefault?: boolean;
};

export async function createBankAccount(input: BankAccountInput): Promise<string> {
  if (!input.bankName.trim() || !input.accountHolder.trim()) throw new Error("Banka adı ve hesap sahibi gerekli.");
  if (input.isDefault) await db.companyBankAccount.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  const row = await db.companyBankAccount.create({
    data: {
      bankName: input.bankName.trim(),
      accountHolder: input.accountHolder.trim(),
      iban: input.iban?.trim() || null,
      swift: input.swift?.trim() || null,
      currency: input.currency,
      country: input.country?.trim() || null,
      active: input.active ?? true,
      isDefault: input.isDefault ?? false,
    },
  });
  return row.id;
}

export async function updateBankAccount(id: string, input: BankAccountInput): Promise<void> {
  if (input.isDefault) await db.companyBankAccount.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
  await db.companyBankAccount.update({
    where: { id },
    data: {
      bankName: input.bankName.trim(),
      accountHolder: input.accountHolder.trim(),
      iban: input.iban?.trim() || null,
      swift: input.swift?.trim() || null,
      currency: input.currency,
      country: input.country?.trim() || null,
      active: input.active ?? true,
      isDefault: input.isDefault ?? false,
    },
  });
}

export async function deleteBankAccount(id: string): Promise<void> {
  await db.companyBankAccount.delete({ where: { id } });
}
