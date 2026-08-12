import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getLocaleOverrides } from "@/server/content";
import { applyOverrides, type Messages } from "@/lib/content-merge";

/**
 * next-intl request configuration. Resolves the active locale, loads that
 * locale's message catalog, then merges any CMS content overrides on top — so
 * text edited in the "Sayfalar & Metinler" panel appears across the site without
 * touching any component. Override loading fails safe (empty map on error), so
 * a DB hiccup only means the compiled defaults are used.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const base = (await import(`../../messages/${locale}.json`)).default as Messages;

  let messages: Messages = base;
  try {
    const overrides = await getLocaleOverrides(locale);
    if (Object.keys(overrides).length > 0) {
      messages = applyOverrides(base, overrides);
    }
  } catch {
    messages = base;
  }

  return { locale, messages };
});
