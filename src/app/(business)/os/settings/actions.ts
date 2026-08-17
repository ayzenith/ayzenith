"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { saveOsSettings } from "@/server/os/settings";
import { seedStarterChannels } from "@/server/os/channels";
import { CURRENCY_CODES } from "@/config/os";

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
