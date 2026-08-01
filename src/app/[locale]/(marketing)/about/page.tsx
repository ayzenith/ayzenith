import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Media } from "@/components/ui/media";
import { CTASection } from "@/components/sections/cta-section";
import { buildMetadata } from "@/lib/seo";

/**
 * About — the credibility & permanence page (Website Experience Blueprint).
 * Answers "who is behind this, and will they last?". Built entirely from shared
 * primitives + the asset registry, so it is asset-independent and consistent.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about.meta");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/about",
  });
}

const principles = [
  "focus",
  "trust",
  "accountability",
  "international",
  "responsible",
  "permanence",
] as const;
const standardsPoints = ["vetting", "quality", "redundancy", "compliance"] as const;

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      {/* Purpose */}
      <Section labelledBy="purpose-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal>
              <div>
                <p className="eyebrow text-accent">{t("purpose.overline")}</p>
                <h2
                  id="purpose-heading"
                  className="mt-4 text-balance font-sans text-h3 font-semibold text-foreground"
                >
                  {t("purpose.title")}
                </h2>
                <p className="mt-6 text-body-lg text-muted">{t("purpose.body1")}</p>
                <p className="mt-4 text-body text-muted">{t("purpose.body2")}</p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <Media
                assetKey="about.operations"
                alt={t("purpose.imageAlt")}
                aspect="wide"
                sizes="(min-width: 1024px) 40rem, 100vw"
              />
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Principles */}
      <Section labelledBy="principles-heading" className="bg-surface/40">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="principles-heading"
              overline={t("principles.overline")}
              title={t("principles.title")}
              intro={t("principles.intro")}
            />
          </Reveal>
          <ul className="mt-14 grid gap-6 sm:grid-cols-2">
            {principles.map((key, index) => (
              <Reveal as="li" key={key} delay={index * 0.06}>
                <article className="h-full rounded-lg border border-border bg-surface/60 p-8">
                  <h3 className="font-sans text-h5 font-semibold text-foreground">
                    {t(`principles.items.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-body text-muted">
                    {t(`principles.items.${key}.description`)}
                  </p>
                </article>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Standards & accountability */}
      <Section labelledBy="standards-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal className="lg:order-2">
              <Media
                assetKey="about.accountability"
                alt={t("standards.imageAlt")}
                aspect="portrait"
                sizes="(min-width: 1024px) 32rem, 100vw"
              />
            </Reveal>
            <Reveal className="lg:order-1">
              <div>
                <p className="eyebrow text-accent">{t("standards.overline")}</p>
                <h2
                  id="standards-heading"
                  className="mt-4 text-balance font-sans text-h3 font-semibold text-foreground"
                >
                  {t("standards.title")}
                </h2>
                <p className="mt-6 text-body-lg text-muted">{t("standards.body")}</p>
                <ul className="mt-8 flex flex-col gap-4">
                  {standardsPoints.map((key) => (
                    <li key={key} className="flex gap-3">
                      <Check
                        className="mt-1 size-5 shrink-0 text-accent"
                        aria-hidden="true"
                        strokeWidth={2}
                      />
                      <span className="text-body text-foreground">
                        {t(`standards.points.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* The long view */}
      <Section labelledBy="longview-heading" size="lg" className="bg-surface/40">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="eyebrow text-accent">{t("longview.overline")}</p>
            <h2
              id="longview-heading"
              className="mt-6 text-balance font-sans text-h2 font-semibold text-foreground"
            >
              {t("longview.title")}
            </h2>
            <p className="measure mx-auto mt-6 text-body-lg text-muted">
              {t("longview.body")}
            </p>
            <figure className="mt-12">
              <blockquote className="mx-auto max-w-2xl">
                <p className="text-balance font-serif text-h4 italic leading-snug text-foreground">
                  “{t("longview.quote")}”
                </p>
              </blockquote>
            </figure>
          </Reveal>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
