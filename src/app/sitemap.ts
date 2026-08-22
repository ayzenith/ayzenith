import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { routing } from "@/i18n/routing";
import { getActiveProductSlugs } from "@/server/products";

/**
 * Programmatic sitemap with locale alternates. Each route is emitted once per
 * URL with `alternates.languages` pointing at every locale variant (hreflang) —
 * the one place routes register as the site scales.
 */

const routes: Array<{
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
}> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/services", priority: 0.9, changeFrequency: "monthly" },
  { path: "/export", priority: 0.9, changeFrequency: "monthly" },
  { path: "/products", priority: 0.9, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
];

function urlFor(locale: string, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale
    ? `${siteConfig.url}${clean}`
    : `${siteConfig.url}/${locale}${clean}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const pages = routes.map(({ path, priority, changeFrequency }) => ({
    url: urlFor(routing.defaultLocale, path),
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, urlFor(locale, path)]),
      ),
    },
  }));

  const slugs = await getActiveProductSlugs();
  const products = slugs.map((slug) => {
    const path = `/products/${slug}`;
    return {
      url: urlFor(routing.defaultLocale, path),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((locale) => [locale, urlFor(locale, path)]),
        ),
      },
    };
  });

  return [...pages, ...products];
}
