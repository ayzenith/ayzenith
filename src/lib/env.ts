/**
 * Typed, centralized environment access.
 *
 * All values are OPTIONAL by design: the site builds and runs with zero
 * configuration (analytics off, contact delivery in acknowledge-only mode). A
 * value being present is what "activates" a capability — nothing is hard-wired.
 * This is the single place env vars are read on the client-exposed side, so a
 * typo or rename is caught in one file.
 *
 * NEXT_PUBLIC_* vars are inlined into the client bundle at build time; keep only
 * non-secret identifiers here. Secrets (API keys) are read server-side only,
 * inside their own modules (see lib/contact/delivery.ts).
 */

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const env = {
  /** Canonical site origin, no trailing slash. */
  siteUrl: trimTrailingSlash(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ayzenith.com",
  ),

  /** Analytics identifiers — presence enables the respective integration. */
  analytics: {
    /** Google Analytics 4 measurement id, e.g. "G-XXXXXXX". */
    ga4Id: process.env.NEXT_PUBLIC_GA4_ID?.trim() || undefined,
    /** Microsoft Clarity project id. */
    clarityId: process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || undefined,
  },

  /** Google Search Console HTML-tag verification token. */
  googleSiteVerification:
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined,
} as const;

/** True in production builds — gate dev-only behavior with this. */
export const isProduction = process.env.NODE_ENV === "production";
