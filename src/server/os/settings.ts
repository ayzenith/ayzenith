import "server-only";

import { cache } from "react";
import type { Prisma, TradeDocLanguage } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_BASE_CURRENCY } from "@/config/os";
import { DEFAULT_COMPANY_PROFILE } from "@/config/trade-documents";
import { D, type Dec } from "./money";

/**
 * Business OS settings — a single row (id = "os"), the same pattern RadarSetting
 * and LeadSetting already use. Every field falls back to a compiled default, so
 * the module works before anyone has visited the settings screen.
 */

export type CompanyProfile = typeof DEFAULT_COMPANY_PROFILE;

export type OsSettings = {
  baseCurrency: string;
  defaultCountry: string;
  allowNegativeStock: boolean;
  fxRates: Record<string, number>;
  fxUpdatedAt: Date | null;
  company: CompanyProfile;
};

const DEFAULTS: OsSettings = {
  baseCurrency: DEFAULT_BASE_CURRENCY,
  defaultCountry: "TR",
  allowNegativeStock: false,
  fxRates: {},
  fxUpdatedAt: null,
  company: DEFAULT_COMPANY_PROFILE,
};

export const getOsSettings = cache(async (): Promise<OsSettings> => {
  try {
    const row = await db.osSetting.findUnique({ where: { id: "os" } });
    if (!row) return DEFAULTS;
    const rates =
      row.fxRates && typeof row.fxRates === "object" && !Array.isArray(row.fxRates)
        ? (row.fxRates as Record<string, number>)
        : {};
    return {
      baseCurrency: row.baseCurrency || DEFAULTS.baseCurrency,
      defaultCountry: row.defaultCountry || DEFAULTS.defaultCountry,
      allowNegativeStock: row.allowNegativeStock,
      fxRates: rates,
      fxUpdatedAt: row.fxUpdatedAt,
      company: {
        companyLegalName: row.companyLegalName || DEFAULT_COMPANY_PROFILE.companyLegalName,
        companyTradingName: row.companyTradingName || DEFAULT_COMPANY_PROFILE.companyTradingName,
        companyAddress: row.companyAddress || DEFAULT_COMPANY_PROFILE.companyAddress,
        companyCountry: row.companyCountry || DEFAULT_COMPANY_PROFILE.companyCountry,
        companyCity: row.companyCity || DEFAULT_COMPANY_PROFILE.companyCity,
        companyPostalCode: row.companyPostalCode ?? DEFAULT_COMPANY_PROFILE.companyPostalCode,
        companyPhone: row.companyPhone || DEFAULT_COMPANY_PROFILE.companyPhone,
        companyEmail: row.companyEmail || DEFAULT_COMPANY_PROFILE.companyEmail,
        companyWebsite: row.companyWebsite || DEFAULT_COMPANY_PROFILE.companyWebsite,
        companyTaxNumber: row.companyTaxNumber ?? DEFAULT_COMPANY_PROFILE.companyTaxNumber,
        companyVatNumber: row.companyVatNumber ?? DEFAULT_COMPANY_PROFILE.companyVatNumber,
        companyChamberReg: row.companyChamberReg ?? DEFAULT_COMPANY_PROFILE.companyChamberReg,
        companyLogoUrl: row.companyLogoUrl ?? DEFAULT_COMPANY_PROFILE.companyLogoUrl,
        defaultDocLanguage: row.defaultDocLanguage || DEFAULT_COMPANY_PROFILE.defaultDocLanguage,
        defaultDocFooterNote: row.defaultDocFooterNote ?? DEFAULT_COMPANY_PROFILE.defaultDocFooterNote,
      },
    };
  } catch {
    return DEFAULTS;
  }
});

export async function saveOsSettings(input: {
  baseCurrency?: string;
  defaultCountry?: string;
  allowNegativeStock?: boolean;
  fxRates?: Record<string, number>;
}): Promise<void> {
  const data: Prisma.OsSettingUpdateInput = {};
  if (input.baseCurrency) data.baseCurrency = input.baseCurrency;
  if (input.defaultCountry) data.defaultCountry = input.defaultCountry;
  if (input.allowNegativeStock !== undefined) data.allowNegativeStock = input.allowNegativeStock;
  if (input.fxRates) {
    data.fxRates = input.fxRates as Prisma.InputJsonValue;
    data.fxUpdatedAt = new Date();
  }
  await db.osSetting.upsert({
    where: { id: "os" },
    create: {
      id: "os",
      baseCurrency: input.baseCurrency ?? DEFAULTS.baseCurrency,
      defaultCountry: input.defaultCountry ?? DEFAULTS.defaultCountry,
      allowNegativeStock: input.allowNegativeStock ?? false,
      fxRates: (input.fxRates ?? {}) as Prisma.InputJsonValue,
      fxUpdatedAt: input.fxRates ? new Date() : null,
    },
    update: data,
  });
}

/** Saves the issuing-company profile used on trade documents. Every field
 *  optional — an empty string clears back to the compiled default. */
export async function saveCompanyProfile(input: Partial<CompanyProfile>): Promise<void> {
  const data: Prisma.OsSettingUpdateInput = {};
  const set = (key: keyof CompanyProfile, dbKey: string) => {
    if (!(key in input)) return;
    const v = input[key];
    (data as Record<string, unknown>)[dbKey] = v === "" ? null : v;
  };
  set("companyLegalName", "companyLegalName");
  set("companyTradingName", "companyTradingName");
  set("companyAddress", "companyAddress");
  set("companyCountry", "companyCountry");
  set("companyCity", "companyCity");
  set("companyPostalCode", "companyPostalCode");
  set("companyPhone", "companyPhone");
  set("companyEmail", "companyEmail");
  set("companyWebsite", "companyWebsite");
  set("companyTaxNumber", "companyTaxNumber");
  set("companyVatNumber", "companyVatNumber");
  set("companyChamberReg", "companyChamberReg");
  set("companyLogoUrl", "companyLogoUrl");
  set("defaultDocFooterNote", "defaultDocFooterNote");
  if (input.defaultDocLanguage) data.defaultDocLanguage = input.defaultDocLanguage as TradeDocLanguage;

  const plain = data as Record<string, string | null | undefined>;
  await db.osSetting.upsert({
    where: { id: "os" },
    create: { id: "os", ...plain, defaultDocLanguage: input.defaultDocLanguage ?? undefined },
    update: data,
  });
}

/**
 * The rate to PRE-FILL a new document with. It is only a suggestion: once the
 * document is saved its own `fxRate` is authoritative and this table can move
 * freely without rewriting a single past margin.
 */
export function suggestFxRate(
  settings: OsSettings,
  currency: string,
): Dec {
  if (currency === settings.baseCurrency) return D(1);
  const r = settings.fxRates[currency];
  return r && Number.isFinite(r) && r > 0 ? D(r) : D(1);
}
