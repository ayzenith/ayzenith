import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import type { AssetKey } from "@/config/assets";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Media } from "@/components/ui/media";
import { CTASection } from "@/components/sections/cta-section";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Services — the capability & fit page (Website Experience Blueprint). Four
 * outcome-led feature blocks, then the full enterprise service set grouped by
 * domain. The healthcare partnership group is positioned strictly as
 * coordination — a visible note states AYZENITH is not a provider or clinic.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("services.meta");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/services",
  });
}

const items: ReadonlyArray<{ key: string; asset: AssetKey }> = [
  { key: "sourcing", asset: "services.sourcing" },
  { key: "distribution", asset: "services.distribution" },
  { key: "privateLabel", asset: "services.privateLabel" },
  { key: "partnerships", asset: "services.partnerships" },
];

const groups: ReadonlyArray<{
  key: string;
  services: readonly string[];
  hasNote?: boolean;
}> = [
  { key: "trade", services: ["techSourcing", "electronics", "wholesale", "oem"] },
  { key: "manufacturing", services: ["textile"] },
  { key: "healthcareSupply", services: ["dental", "medical"], hasNote: true },
  {
    key: "healthcarePartnership",
    services: ["hair", "prp", "meso", "exosome"],
    hasNote: true,
  },
];

export default async function ServicesPage() {
  const t = await getTranslations("services");

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      {/* Core capabilities — alternating feature blocks */}
      <Section labelledBy="services-intro-heading">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="services-intro-heading"
              overline={t("intro.overline")}
              title={t("intro.title")}
              intro={t("intro.body")}
            />
          </Reveal>

          <div className="mt-16 flex flex-col gap-16 md:gap-24">
            {items.map(({ key, asset }, index) => {
              const mediaRight = index % 2 === 0;
              return (
                <div
                  key={key}
                  className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16"
                >
                  <Reveal className={cn(mediaRight ? "lg:order-2" : "lg:order-1")}>
                    <Media
                      assetKey={asset}
                      alt={t(`items.${key}.imageAlt`)}
                      aspect="wide"
                      sizes="(min-width: 1024px) 36rem, 100vw"
                    />
                  </Reveal>
                  <Reveal
                    delay={0.08}
                    className={cn(mediaRight ? "lg:order-1" : "lg:order-2")}
                  >
                    <div>
                      <p className="eyebrow text-accent">{t(`items.${key}.outcome`)}</p>
                      <h3 className="mt-4 font-sans text-h3 font-semibold text-foreground">
                        {t(`items.${key}.title`)}
                      </h3>
                      <p className="mt-5 text-body-lg text-muted">
                        {t(`items.${key}.description`)}
                      </p>
                    </div>
                  </Reveal>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Full enterprise service set, grouped by domain */}
      <Section labelledBy="services-groups-heading" tone="gray">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="services-groups-heading"
              overline={t("groups.overline")}
              title={t("groups.title")}
              intro={t("groups.intro")}
            />
          </Reveal>

          <div className="mt-16 flex flex-col gap-16">
            {groups.map((group) => (
              <div key={group.key}>
                <h3 className="font-sans text-h4 font-semibold text-foreground">
                  {t(`groups.${group.key}.title`)}
                </h3>

                {group.hasNote ? (
                  <div className="mt-4 flex max-w-3xl gap-3 rounded-md border border-border bg-surface p-4">
                    <Info
                      className="mt-0.5 size-5 shrink-0 text-accent"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    <p className="text-small text-muted">
                      {t(`groups.${group.key}.note`)}
                    </p>
                  </div>
                ) : null}

                <ul className="mt-8 grid gap-6 sm:grid-cols-2">
                  {group.services.map((service, index) => (
                    <Reveal as="li" key={service} delay={index * 0.05}>
                      <article className="h-full rounded-lg border border-border bg-surface p-8 shadow-sm">
                        <h4 className="font-sans text-h6 font-semibold text-foreground">
                          {t(`groups.${group.key}.services.${service}.title`)}
                        </h4>
                        <p className="mt-3 text-body text-muted">
                          {t(`groups.${group.key}.services.${service}.description`)}
                        </p>
                      </article>
                    </Reveal>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
