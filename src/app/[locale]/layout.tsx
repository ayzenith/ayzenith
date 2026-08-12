import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { fontVariables } from "@/lib/fonts";
import { buildMetadata, structuredData } from "@/lib/seo";
import { siteConfig } from "@/config/site";
import { routing } from "@/i18n/routing";
import { Analytics } from "@/components/analytics/analytics";
import "../globals.css";

/**
 * Root layout — the single HTML shell for the entire application, scoped to the
 * active locale. Validates the locale, sets <html lang>, provides the i18n
 * message context, default metadata (with locale-aware canonical + hreflang)
 * and site-wide Organization structured data. Server Component; no client JS.
 */

export async function generateMetadata(): Promise<Metadata> {
  const base = await buildMetadata();
  return {
    metadataBase: new URL(siteConfig.url),
    ...base,
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    publisher: siteConfig.name,
    formatDetection: { email: false, address: false, telephone: false },
    verification: {
      google: "4wDG53GqXshepIPZSTOBy6fjiTu1nEYKEFvC3Jy2sx4",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#050b14" },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} data-theme="light" className={fontVariables}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          // Structured data is a static, trusted, developer-authored payload.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData()),
          }}
        />
        {/* locale MUST be passed alongside messages — without it useLocale()
            throws on the client and hydration fails across the whole tree. */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
