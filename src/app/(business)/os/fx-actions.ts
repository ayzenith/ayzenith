"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { suggestRates, syncTcmb } from "@/server/os/fx";
import { isIsoDay, istanbulDay, type FxSuggestion } from "@/server/os/fx-tcmb";

/** The rate pre-fill for every currency, for a document dated `day` — what the
 *  sale and purchase forms ask for whenever their date changes. */
export async function fxRatesForDayAction(day: string): Promise<Record<string, FxSuggestion>> {
  await requireUser();
  return suggestRates(isIsoDay(day) ? day : istanbulDay());
}

/** Settings → "TCMB'den şimdi güncelle". */
export async function syncTcmbAction(): Promise<void> {
  await requireUser();
  await syncTcmb();
  revalidatePath("/os/settings");
}
