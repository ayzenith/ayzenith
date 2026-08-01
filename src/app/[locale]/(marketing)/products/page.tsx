import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Cpu,
  Smartphone,
  Cable,
  CookingPot,
  Shirt,
  Stethoscope,
  Layers3,
  Building2,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { CTASection } from "@/components/sections/cta-section";
import { buildMetadata } from "@/lib/seo";

/**
 * Products — the tangibility & proof page (Website Experience Blueprint).
 * Presents categories as evidence of sourcing capability — never a price-driven
 * catalogue — and routes to the premium B2B path (marketplaces kept clearly
 * secondary so the brand never reads as a discount reseller).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products.meta");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/products",
  });
}

const categories: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "electronics", icon: Cpu },
  { key: "smart", icon: Smartphone },
  { key: "mobile", icon: Cable },
  { key: "home", icon: CookingPot },
  { key: "textile", icon: Shirt },
  { key: "medical", icon: Stethoscope },
  { key: "dental", icon: Layers3 },
];

const engagements: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "b2b", icon: Building2 },
  { key: "marketplace", icon: ShoppingBag },
];

export default async function ProductsPage() {
  const t = await getTranslations("products");

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      {/* Categories as proof of sourcing capability */}
      <Section labelledBy="products-intro-heading">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="products-intro-heading"
              overline={t("intro.overline")}
              title={t("intro.title")}
              intro={t("intro.body")}
            />
          </Reveal>

          <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(({ key, icon: Icon }, index) => (
              <Reveal as="li" key={key} delay={index * 0.05}>
                <article className="group h-full rounded-lg border border-border bg-surface p-8 shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                  <span className="inline-flex size-12 items-center justify-center rounded-md border border-border text-accent transition-colors duration-300 group-hover:border-accent/60">
                    <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-6 font-sans text-h6 font-semibold text-foreground">
                    {t(`categories.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-body text-muted">
                    {t(`categories.${key}.description`)}
                  </p>
                </article>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* How to engage — B2B primary, marketplace secondary */}
      <Section labelledBy="engage-heading" tone="gray">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="engage-heading"
              overline={t("engage.overline")}
              title={t("engage.title")}
            />
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {engagements.map(({ key, icon: Icon }, index) => (
              <Reveal key={key} delay={index * 0.06}>
                <article className="flex h-full flex-col rounded-lg border border-border bg-surface p-8 shadow-sm">
                  <span className="inline-flex size-12 items-center justify-center rounded-md border border-border text-accent">
                    <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-6 font-sans text-h5 font-semibold text-foreground">
                    {t(`engage.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-body text-muted">
                    {t(`engage.${key}.description`)}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
