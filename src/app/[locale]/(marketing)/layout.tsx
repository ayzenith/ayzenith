import { setRequestLocale } from "next-intl/server";
import { SkipLink } from "@/components/layout/skip-link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Marketing layout — the shared chrome for every public page (home, about,
 * services, products, contact). The route group "(marketing)" adds no URL
 * segment. Chrome lives here once (DRY); each page returns only its content,
 * which is wrapped in the single <main> landmark the skip-link targets.
 */
export default async function MarketingLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // Declared here as well as in the root layout, because Next renders the
  // segments CONCURRENTLY: <Footer> below calls getTranslations and would
  // otherwise start before the parent had declared the locale, fall back to
  // reading request headers, and drop every public page out of static
  // rendering. That cost measured ~600ms TTFB and `Cache-Control: no-store`
  // on the whole site.
  setRequestLocale((await params).locale);

  return (
    <>
      <SkipLink />
      <Navbar />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
