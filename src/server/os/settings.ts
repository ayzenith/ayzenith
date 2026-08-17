import "server-only";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_BASE_CURRENCY } from "@/config/os";
import { D, type Dec } from "./money";

/**
 * Business OS settings — a single row (id = "os"), the same pattern RadarSetting
 * and LeadSetting already use. Every field falls back to a compiled default, so
 * the module works before anyone has visited the settings screen.
 */

export type OsSettings = {
  baseCurrency: string;
  defaultCountry: string;
  allowNegativeStock: boolean;
  fxRates: Record<string, number>;
  fxUpdatedAt: Date | null;
};

const DEFAULTS: OsSettings = {
  baseCurrency: DEFAULT_BASE_CURRENCY,
  defaultCountry: "TR",
  allowNegativeStock: false,
  fxRates: {},
  fxUpdatedAt: null,
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
