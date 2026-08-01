import { getTranslations } from "next-intl/server";

/**
 * Keyboard skip-link — the first focusable element on the page, visually hidden
 * until focused. Lets keyboard and screen-reader users bypass the navigation
 * straight to <main> (WCAG 2.2 — 2.4.1 Bypass Blocks). Server Component.
 */
export async function SkipLink() {
  const t = await getTranslations("nav");
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-accent px-4 py-2 font-semibold text-navy-950 focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100]"
    >
      {t("skip")}
    </a>
  );
}
