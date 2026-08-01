/**
 * Single source of truth for company-level constants. Kept framework-free so it
 * can be imported by metadata, structured data, the footer, and future apps.
 */

export const siteConfig = {
  name: "AYZENITH",
  legalName: "AYZENITH",
  /** The core promise — Brand Strategy, frozen. */
  tagline: "Global Trade. Absolute Trust.",
  description:
    "AYZENITH is a global B2B commerce, sourcing and investment group. We source, move and stand behind products across borders — so ambitious businesses can grow globally without carrying the risk.",
  /** Resolved from env; safe production default. No trailing slash. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ayzenith.com").replace(
    /\/$/,
    "",
  ),
  locale: "en",
  contactEmail: "info@ayzenith.com",
} as const;

/**
 * Verified company contact details — the single source of truth used by the
 * footer, contact page and structured data. Factual, never translated.
 */
export const companyInfo = {
  email: "info@ayzenith.com",
  phone: "+90 541 437 19 07",
  /** E.164 form for tel: links. */
  phoneHref: "+905414371907",
  location: "Ataköy, Istanbul, Türkiye",
  city: "Istanbul",
  country: "Türkiye",
  hoursShort: "Mon – Fri · 09:00 – 18:00 (GMT+3)",
  hoursLong: "Monday – Friday, 09:00 – 18:00 (GMT+3)",
} as const;

export type NavItem = {
  readonly labelKey: string;
  readonly href: string;
};

/** Primary navigation. Lean by design — an institution keeps its lobby clear. */
export const primaryNav: readonly NavItem[] = [
  { labelKey: "about", href: "/about" },
  { labelKey: "services", href: "/services" },
  { labelKey: "products", href: "/products" },
  { labelKey: "contact", href: "/contact" },
] as const;

export const footerNav = {
  company: [
    { labelKey: "about", href: "/about" },
    { labelKey: "services", href: "/services" },
    { labelKey: "products", href: "/products" },
  ],
  engage: [
    { labelKey: "partnership", href: "/contact" },
    { labelKey: "contact", href: "/contact" },
  ],
} as const;
