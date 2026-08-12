import { Link } from "@/i18n/navigation";
import { ArrowUp, Linkedin, Instagram, Twitter, Youtube, Facebook } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { footerNav, siteConfig } from "@/config/site";
import { getSiteSettings } from "@/server/settings";

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
  const settings = await getSiteSettings();
  const year = new Date().getFullYear();

  const socials = [
    { href: settings.linkedin, icon: Linkedin, label: "LinkedIn" },
    { href: settings.instagram, icon: Instagram, label: "Instagram" },
    { href: settings.x, icon: Twitter, label: "X" },
    { href: settings.youtube, icon: Youtube, label: "YouTube" },
    { href: settings.facebook, icon: Facebook, label: "Facebook" },
  ].filter((s) => s.href);

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
                  href={`mailto:${settings.companyEmail}`}
                  className="text-muted transition-colors hover:text-foreground"
                >
                  {settings.companyEmail}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${settings.companyPhoneHref}`}
                  className="tabular-nums text-muted transition-colors hover:text-foreground"
                >
                  {settings.companyPhone}
                </a>
              </li>
              <li className="text-muted">{settings.companyLocation}</li>
              <li className="text-subtle">{settings.hoursShort}</li>
            </ul>

            {socials.length > 0 ? (
              <ul className="mt-2 flex gap-3">
                {socials.map(({ href, icon: Icon, label }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
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
