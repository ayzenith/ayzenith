import "server-only";

import type { Messages } from "@/lib/content-merge";
import type { Locale } from "@/i18n/routing";

/** Load a locale's compiled base catalog (messages/<locale>.json). */
export async function loadBaseMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}
