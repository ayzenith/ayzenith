import { defineRouting } from "next-intl/routing";

/**
 * i18n routing — English is the default and served at the root (no /en prefix);
 * Turkish and German are served under /tr and /de. `localePrefix: "as-needed"`
 * keeps the default locale clean while prefixing the others.
 */
export const routing = defineRouting({
  locales: ["en", "tr", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  // Both OFF so every public page is CDN-cacheable. next-intl otherwise writes a
  // NEXT_LOCALE cookie on every response, and a response that sets a cookie can
  // never be shared between visitors — which pinned the whole site to
  // "Cache-Control: no-store" no matter how well it prerendered. Language is
  // chosen explicitly via the switcher (and announced to search engines by the
  // hreflang alternates in lib/seo.ts), so nothing is lost but the guess.
  localeCookie: false,
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/** Human-facing labels for the language selector. */
export const localeNames: Record<Locale, { label: string; short: string }> = {
  en: { label: "English", short: "EN" },
  tr: { label: "Türkçe", short: "TR" },
  de: { label: "Deutsch", short: "DE" },
};

/** OpenGraph locale codes per locale. */
export const ogLocales: Record<Locale, string> = {
  en: "en_US",
  tr: "tr_TR",
  de: "de_DE",
};
