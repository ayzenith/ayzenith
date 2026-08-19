import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { siteConfig, companyInfo } from "@/config/site";
import { routing, ogLocales, type Locale } from "@/i18n/routing";
import { env } from "@/lib/env";

/**
 * Centralized metadata + structured data. Every route builds its <head> from
 * here so titles, canonicals, hreflang, social cards and JSON-LD are correct by
 * construction — SEO is architecture, not an afterthought.
 */

/** Fully-qualified URL for a path in a given locale (default locale = no prefix). */
function localizedUrl(locale: string, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale
    ? `${siteConfig.url}${clean}`
    : `${siteConfig.url}/${locale}${clean}`;
}

type BuildMetadataArgs = {
  title?: string;
  /** Complete <title>, used verbatim with no brand suffix (localized homepage). */
  fullTitle?: string;
  description?: string;
  /** Site-relative path, e.g. "/" or "/about". */
  path?: string;
  /** OG/Twitter card image — absolute URL or site-relative path. */
  image?: string;
  noIndex?: boolean;
};

export async function buildMetadata({
  title,
  fullTitle,
  description = siteConfig.description,
  path = "/",
  image,
  noIndex = false,
}: BuildMetadataArgs = {}): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const url = localizedUrl(locale, path);

  // hreflang alternates for every locale + x-default.
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedUrl(l, path);
  languages["x-default"] = localizedUrl(routing.defaultLocale, path);

  const resolvedTitle =
    fullTitle ??
    (title
      ? `${title} · ${siteConfig.name}`
      : `${siteConfig.name} — ${siteConfig.tagline}`);

  // Every page needs a share image. Without one, a link pasted into WhatsApp
  // or LinkedIn renders as bare text — and the twitter card below promises
  // "summary_large_image", so an absent image is a promise the page breaks.
  // src/app/opengraph-image.tsx renders the branded 1200x630 card; it was
  // already built and served, just never referenced, because this only filled
  // in when a caller passed a page-specific image and none ever did.
  const ogImages = [
    image
      ? { url: image.startsWith("http") ? image : `${siteConfig.url}${image}` }
      : {
          url: `${siteConfig.url}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
  ];

  return {
    title: resolvedTitle,
    description,
    alternates: {
      canonical: url,
      languages,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: resolvedTitle,
      description,
      url,
      locale: ogLocales[locale],
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: ogImages,
    },
    verification: env.googleSiteVerification
      ? { google: env.googleSiteVerification }
      : undefined,
  };
}

/**
 * Site-wide structured data as a JSON-LD @graph (Organization + WebSite).
 * Establishes AYZENITH as a real, verifiable entity — a decisive B2B trust and
 * search-authority signal. Static, developer-authored, injected once in the
 * root layout.
 */
export function structuredData() {
  const orgId = `${siteConfig.url}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: siteConfig.name,
        legalName: siteConfig.legalName,
        url: siteConfig.url,
        description: siteConfig.description,
        slogan: siteConfig.tagline,
        logo: `${siteConfig.url}/brand/ayzenith-logo.png`,
        email: companyInfo.email,
        telephone: companyInfo.phone,
        foundingLocation: { "@type": "Country", name: "Türkiye" },
        address: {
          "@type": "PostalAddress",
          addressLocality: "Ataköy, Istanbul",
          addressCountry: "TR",
        },
        areaServed: ["Europe", "Middle East", "Asia", "Americas"],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          email: companyInfo.email,
          telephone: companyInfo.phone,
          availableLanguage: ["English", "Turkish", "German"],
          hoursAvailable: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            opens: "09:00",
            closes: "18:00",
          },
        },
        knowsAbout: [
          "Global trade",
          "International sourcing",
          "Import and export",
          "Distribution",
          "Private label development",
          "Manufacturing partnerships",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        url: siteConfig.url,
        name: siteConfig.name,
        description: siteConfig.description,
        inLanguage: "en",
        publisher: { "@id": orgId },
      },
    ],
  } as const;
}

/**
 * Per-product JSON-LD (schema.org/Product). No price is published — AYZENITH is
 * a showcase, not a store — so no Offer is emitted: the graph stays valid and
 * honest while still giving search engines a rich product entity. Injected once
 * per product detail page with already-localized strings.
 */
export function productStructuredData(input: {
  name: string;
  description: string;
  category: string;
  image?: string | null;
  url: string;
  specs?: ReadonlyArray<{ label: string; value: string }>;
}) {
  const image = input.image
    ? input.image.startsWith("http")
      ? input.image
      : `${siteConfig.url}${input.image}`
    : `${siteConfig.url}/opengraph-image`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    category: input.category,
    image,
    url: input.url,
    brand: { "@type": "Organization", name: siteConfig.name },
    ...(input.specs && input.specs.length > 0
      ? {
          additionalProperty: input.specs.map((s) => ({
            "@type": "PropertyValue",
            name: s.label,
            value: s.value,
          })),
        }
      : {}),
  } as const;
}
