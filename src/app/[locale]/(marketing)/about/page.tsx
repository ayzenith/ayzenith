import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Metadata is generated BEFORE the component body runs, so the locale has to
  // be declared here as well. Without it next-intl falls back to reading request
  // headers, which opts the whole route out of static rendering.
  setRequestLocale((await params).locale);

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
const missionFields = [
  "electronics",
  "smartDevices",
  "mobileAccessories",
  "homeKitchen",
  "textile",
  "medical",
  "dental",
] as const;

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  setRequestLocale((await params).locale);
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

      {/* Mission — what we do today */}
      <Section labelledBy="mission-heading" className="bg-surface/40">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div>
                <p className="eyebrow text-accent">{t("mission.overline")}</p>
                <h2
                  id="mission-heading"
                  className="mt-4 text-balance font-sans text-h3 font-semibold text-foreground"
                >
                  {t("mission.title")}
                </h2>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div>
                <p className="text-body-lg text-muted">{t("mission.body")}</p>
                <p className="mt-4 text-body text-muted">{t("mission.model")}</p>
                <p className="eyebrow mt-8 text-accent">{t("mission.fieldsLabel")}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {missionFields.map((key) => (
                    <li
                      key={key}
                      className="rounded-pill border border-border bg-surface/60 px-4 py-1.5 text-caption text-foreground"
                    >
                      {t(`mission.fields.${key}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-caption text-muted">{t("mission.health")}</p>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Principles */}
      <Section labelledBy="principles-heading">
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
      <Section labelledBy="standards-heading" className="bg-surface/40">
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

      {/* Vision — where we are going */}
      <Section labelledBy="vision-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div>
                <p className="eyebrow text-accent">{t("vision.overline")}</p>
                <h2
                  id="vision-heading"
                  className="mt-4 text-balance font-sans text-h3 font-semibold text-foreground"
                >
                  {t("vision.title")}
                </h2>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="text-body-lg text-muted">{t("vision.body")}</p>
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
