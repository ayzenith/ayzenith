import { SkipLink } from "@/components/layout/skip-link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Marketing layout — the shared chrome for every public page (home, about,
 * services, products, contact). The route group "(marketing)" adds no URL
 * segment. Chrome lives here once (DRY); each page returns only its content,
 * which is wrapped in the single <main> landmark the skip-link targets.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
