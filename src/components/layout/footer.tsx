import { Link } from "@/i18n/navigation";
import { ArrowUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { companyInfo, footerNav, siteConfig } from "@/config/site";

/**
 * Footer — the institutional base (Wireframe 09). Server Component with zero
 * client JS: navigation is real anchors and "back to top" is a plain in-page
 * link, so smooth scrolling is handled by CSS (and disabled under
 * prefers-reduced-motion) with nothing shipped to the browser.
 *
 * Carries the legitimacy signals serious B2B buyers verify — legal identity,
 * a considered structure, and a clear return path.
 */
export async function Footer() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer
      data-theme="dark"
      className="relative border-t border-border bg-navy-950"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        {siteConfig.name}
      </h2>

      <Container className="py-16 md:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
          <div className="max-w-sm">
            {/* Decorative: the footer landmark is named by the sr-only <h2>. */}
            <Logo tone="light" alt="" sizes="280px" className="h-16 md:h-20" />
            <p className="mt-6 text-body text-muted">{t("description")}</p>
            <p className="mt-6 eyebrow text-accent">{t("tagline")}</p>
          </div>

          <nav aria-label="Company" className="flex flex-col gap-4">
            <p className="eyebrow text-subtle">{t("companyHeading")}</p>
            <ul className="flex flex-col gap-3">
              {footerNav.company.map((item) => (
                <li key={item.labelKey}>
                  <Link
                    href={item.href}
                    className="text-small text-muted transition-colors hover:text-foreground"
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Engage" className="flex flex-col gap-4">
            <p className="eyebrow text-subtle">{t("engageHeading")}</p>
            <ul className="flex flex-col gap-3">
              {footerNav.engage.map((item) => (
                <li key={item.labelKey}>
                  <Link
                    href={item.href}
                    className="text-small text-muted transition-colors hover:text-foreground"
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-4">
            <p className="eyebrow text-subtle">{t("contactHeading")}</p>
            <ul className="flex flex-col gap-3 text-small">
              <li>
                <a
                  href={`mailto:${companyInfo.email}`}
                  className="text-muted transition-colors hover:text-foreground"
                >
                  {companyInfo.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${companyInfo.phoneHref}`}
                  className="tabular-nums text-muted transition-colors hover:text-foreground"
                >
                  {companyInfo.phone}
                </a>
              </li>
              <li className="text-muted">{companyInfo.location}</li>
              <li className="text-subtle">{companyInfo.hoursShort}</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <nav aria-label={t("legalHeading")} className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                { href: "/privacy", label: t("privacy") },
                { href: "/cookies", label: t("cookies") },
                { href: "/terms", label: t("terms") },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-small text-muted transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Pure same-page hash — a plain anchor (not a routing Link). */}
            <a
              href="#main"
              className="inline-flex items-center gap-2 self-start text-small text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] md:self-auto"
            >
              {t("backToTop")}
              <ArrowUp className="size-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-8 max-w-xl space-y-1">
            <p className="text-caption text-subtle">
              © {year} {siteConfig.legalName}. {t("rightsLabel")}
            </p>
            <p className="text-caption text-subtle">{t("legalNote")}</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
