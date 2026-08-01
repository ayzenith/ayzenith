import { getTranslations } from "next-intl/server";
import { Globe, Truck, Tag, Factory, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/ui/reveal";

/**
 * Capabilities — Breadth at a glance (Wireframe 03). Server Component.
 *
 * A curated four-card grid: breadth shown with order signals a real, structured
 * operation. Icons are inline lucide SVGs (tree-shaken, weightless) — the
 * performance strategy for visuals here is "vector, not raster". Cards enter on
 * a measured 60ms stagger to guide the eye left-to-right without distraction.
 */

const items: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "sourcing", icon: Globe },
  { key: "distribution", icon: Truck },
  { key: "privateLabel", icon: Tag },
  { key: "partnerships", icon: Factory },
];

export async function Capabilities() {
  const t = await getTranslations("capabilities");

  return (
    <Section id="capabilities" labelledBy="capabilities-heading" tone="white">
      <Container>
        <Reveal>
          <SectionHeader
            headingId="capabilities-heading"
            overline={t("overline")}
            title={t("title")}
            intro={t("intro")}
          />
        </Reveal>

        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ key, icon: Icon }, index) => (
            <Reveal as="li" key={key} delay={index * 0.06}>
              <article className="group h-full rounded-lg border border-border bg-surface p-8 shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                <span className="inline-flex size-12 items-center justify-center rounded-md border border-border text-accent transition-colors duration-300 group-hover:border-accent/60">
                  <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                </span>
                <h3 className="mt-6 font-sans text-h6 font-semibold text-foreground">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="mt-3 text-body text-muted">
                  {t(`items.${key}.description`)}
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
