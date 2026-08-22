import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Mail, MapPin, Phone, ShieldCheck, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { ContactForm } from "@/components/sections/contact-form";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/server/settings";

/**
 * Contact — the conversion page (Website Experience Blueprint). Reframes
 * "contact us" as "start a partnership": warm, low-friction, reassuring. Reuses
 * the ContactForm island; the framing, expectations and legitimacy signals are
 * server-rendered and static.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Metadata is generated BEFORE the component body runs, so the locale has to
  // be declared here as well. Without it next-intl falls back to reading request
  // headers, which opts the whole route out of static rendering.
  setRequestLocale((await params).locale);

  const t = await getTranslations("contactPage.meta");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/contact",
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  setRequestLocale((await params).locale);
  const t = await getTranslations("contactPage");
  const settings = await getSiteSettings();

  const infoItems: Array<{
    icon: LucideIcon;
    title: string;
    body?: string;
    link?: { href: string; label: string };
  }> = [
    { icon: Clock, title: t("info.responseTitle"), body: t("info.responseBody") },
    {
      icon: Mail,
      title: t("info.emailTitle"),
      link: { href: `mailto:${settings.companyEmail}`, label: settings.companyEmail },
    },
    {
      icon: Phone,
      title: t("info.phoneTitle"),
      link: { href: `tel:${settings.companyPhoneHref}`, label: settings.companyPhone },
    },
    { icon: MapPin, title: t("info.locationTitle"), body: settings.companyLocation },
    { icon: Clock, title: t("info.hoursTitle"), body: settings.hoursLong },
    {
      icon: ShieldCheck,
      title: t("info.assuranceTitle"),
      body: t("info.assuranceBody"),
    },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      <Section labelledBy="contact-form-heading" size="lg">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <h2 id="contact-form-heading" className="sr-only">
                  Contact AYZENITH
                </h2>
                <ul className="flex flex-col gap-8">
                  {infoItems.map((item) => (
                    <li key={item.title} className="flex gap-4">
                      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-accent">
                        <item.icon className="size-5" aria-hidden="true" strokeWidth={1.5} />
                      </span>
                      <div>
                        <h3 className="font-sans text-h6 font-semibold text-foreground">
                          {item.title}
                        </h3>
                        {item.body ? (
                          <p className="mt-2 text-body text-muted">{item.body}</p>
                        ) : null}
                        {item.link ? (
                          <a
                            href={item.link.href}
                            className="mt-2 inline-block text-body font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
                          >
                            {item.link.label}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <ContactForm />
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  );
}
