import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AssetKey } from "@/config/assets";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/ui/reveal";
import { Media } from "@/components/ui/media";
import { ExportHero } from "@/components/sections/export-hero";
import {
  buildMetadata,
  breadcrumbStructuredData,
  serviceCatalogStructuredData,
} from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Export management — for a manufacturer who wants to sell abroad without
 * building the department it normally takes.
 *
 * SHAPE: the section rhythm is deliberately uneven — a two-column hero, an
 * editorial positioning split, a numbered journey, alternating media blocks, a
 * full-bleed claim, a divided list, a ranked market board, hairline pairs.
 * Repeating one card grid down the page is what makes a B2B page read as
 * generic, so no two consecutive sections share a shape.
 *
 * TWO CONTENT RULES hold this page honest, and both are load-bearing:
 *
 *  1. Nothing here claims a physical presence. AYZENITH has no offices, local
 *     teams or warehouses in these regions, so the map is a corridor diagram
 *     and the market board says "commercial focus" in words. Anything that
 *     could read as a location pin has to stay out.
 *  2. The markets are RANKED, not listed — worked / being built / under
 *     evaluation — and the layout carries the ranking as plainly as the copy
 *     does. Presenting three equal cards would over-claim by implication even
 *     with honest labels underneath.
 *
 * It also claims nothing about marketplace selling: that capability is being
 * built and is not live. Add a fifth block when it is.
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

  const t = await getTranslations("export.meta");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/export",
  });
}

const chain = ["factory", "market", "buyer", "order", "delivery", "growth"] as const;
const steps = ["fit", "entry", "channel", "order", "growth"] as const;
const audience = ["manufacturers", "brands", "producers", "buyers"] as const;
const advantages = ["access", "partner", "selective", "channels"] as const;

const items: ReadonlyArray<{ key: string; asset: AssetKey }> = [
  { key: "rights", asset: "export.rights" },
  { key: "distribution", asset: "export.distribution" },
  { key: "market", asset: "export.market" },
  { key: "operations", asset: "export.operations" },
];

/**
 * The tier rule above each market. All three are solid gold and none is faint:
 * the ranking is carried by length and by the 01/02/03 order, not by draining
 * the colour out of the last one. An expansion map that greys out where the
 * company is going would argue against the strategy it is there to state.
 */
const tierRule: Record<"core" | "growth" | "emerging", string> = {
  core: "h-0.5 w-16 bg-gold-500",
  growth: "h-0.5 w-12 bg-gold-500/70",
  emerging: "h-0.5 w-9 bg-gold-500/55",
};

export default async function ExportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("export");

  // The four responsibilities, stated as addressable Service entities rather
  // than left as prose a crawler has to infer. Built from the same `items`
  // table the page renders from, so the two can never disagree.
  const catalogue = serviceCatalogStructuredData({
    locale,
    path: "/export",
    name: t("intro.title"),
    description: t("intro.body"),
    services: items.map(({ key }) => ({
      name: t(`items.${key}.title`),
      description: t(`items.${key}.description`),
    })),
  });

  const breadcrumbs = breadcrumbStructuredData(locale, [
    { name: t("breadcrumb.home"), path: "/" },
    { name: t("breadcrumb.self"), path: "/export" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        // Developer-authored payload built from the page's own translations.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([catalogue, breadcrumbs]),
        }}
      />
      <ExportHero />

      {/* Positioning — the split that names the handover point. */}
      <Section labelledBy="export-positioning-heading" tone="white">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20">
            <Reveal>
              <div>
                <p className="eyebrow text-accent">{t("positioning.overline")}</p>
                <h2
                  id="export-positioning-heading"
                  className="mt-6 text-balance font-serif text-h2 font-medium leading-[1.15] text-foreground"
                >
                  {t("positioning.title")}
                </h2>
                <p className="measure mt-8 text-body-lg text-muted">
                  {t("positioning.body")}
                </p>
              </div>
            </Reveal>

            {/* Where the product goes once it leaves the gate. */}
            <Reveal delay={0.1}>
              <ol className="relative pl-8">
                <span
                  aria-hidden="true"
                  className="absolute bottom-3 left-[3px] top-3 w-px bg-[linear-gradient(180deg,var(--color-gold-500),rgba(201,162,39,0.15))]"
                />
                {chain.map((link, index) => (
                  <li key={link} className="relative py-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -left-8 top-1/2 size-[7px] -translate-y-1/2 rounded-full",
                        index === 0 ? "bg-gold-500" : "bg-gold-500/45",
                      )}
                    />
                    <span className="font-sans text-h5 font-semibold text-foreground">
                      {t(`positioning.chain.${link}`)}
                    </span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* How it works — five ordered steps on a gold rail. */}
      <Section id="approach" labelledBy="export-process-heading" tone="gray">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="export-process-heading"
              overline={t("process.overline")}
              title={t("process.title")}
              intro={t("process.intro")}
            />
          </Reveal>

          <div className="relative mt-16">
            {/* Connective rail behind the nodes — desktop only, decorative.
                Kept a sibling of the <ol> so the list contains only <li>. */}
            <div
              aria-hidden="true"
              className="hairline-gold absolute left-0 right-0 top-6 hidden h-px lg:block"
            />

            <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
              {steps.map((step, index) => (
                <Reveal as="li" key={step} delay={index * 0.06} className="relative">
                  <span
                    className="relative z-10 inline-flex size-12 items-center justify-center rounded-md border border-border bg-surface font-mono text-caption tabular-nums text-accent shadow-sm"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-6 font-sans text-h6 font-semibold text-foreground">
                    {t(`process.steps.${step}.title`)}
                  </h3>
                  <p className="mt-3 text-small text-muted">
                    {t(`process.steps.${step}.description`)}
                  </p>
                </Reveal>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      {/* What we do — alternating feature blocks, each with its own figure. */}
      <Section labelledBy="export-intro-heading">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="export-intro-heading"
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

      {/* The claim the page is willing to be judged on. Nothing else on it. */}
      <Section labelledBy="export-statement-heading" size="lg" tone="navy">
        <Container>
          <Reveal className="mx-auto max-w-5xl text-center">
            <h2
              id="export-statement-heading"
              className="text-balance font-serif text-h2 font-medium leading-[1.16] md:text-h1"
            >
              <span className="block text-muted">{t("statement.lead")}</span>
              <span className="mt-4 block text-foreground">
                {t("statement.emphasis")}
              </span>
            </h2>
          </Reveal>
        </Container>
      </Section>

      {/* Who we work with — a divided list, not another card grid. */}
      <Section labelledBy="export-audience-heading">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="export-audience-heading"
              overline={t("audience.overline")}
              title={t("audience.title")}
            />
          </Reveal>

          <ul className="mt-14 border-t border-border">
            {audience.map((group, index) => (
              <Reveal as="li" key={group} delay={index * 0.05}>
                <div className="grid items-baseline gap-3 border-b border-border py-8 md:grid-cols-[auto_minmax(0,16rem)_1fr] md:gap-8">
                  <span
                    aria-hidden="true"
                    className="font-mono text-caption tabular-nums text-subtle"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-sans text-h5 font-semibold text-foreground">
                    {t(`audience.${group}.title`)}
                  </h3>
                  <p className="text-body text-muted">
                    {t(`audience.${group}.description`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Markets — ranked by how much of the business is actually there. */}
      <Section labelledBy="export-markets-heading" tone="gray">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="export-markets-heading"
              overline={t("markets.overline")}
              title={t("markets.title")}
              intro={t("markets.intro")}
            />
          </Reveal>

          {/* 01 — the market being worked today. Full width, largest type. */}
          <Reveal className="mt-14">
            <article className="rounded-lg border border-border bg-surface p-8 shadow-sm md:p-12">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="font-mono text-caption tabular-nums text-accent"
                >
                  01
                </span>
                <span aria-hidden="true" className={tierRule.core} />
              </div>
              <p className="eyebrow mt-6 text-accent">{t("markets.europe.label")}</p>
              <h3 className="mt-3 font-sans text-h3 font-semibold text-foreground">
                {t("markets.europe.title")}
              </h3>
              <p className="mt-6 font-sans text-h5 font-medium text-foreground">
                {t("markets.europe.countries")}
              </p>
              <p className="measure mt-4 text-body text-muted">
                {t("markets.europe.description")}
              </p>
            </article>
          </Reveal>

          {/* 02 and 03 — the network being built, and where it is heading next.
              Identical chrome on purpose: the sequence and the rule length carry
              the ranking, so neither reads as a market AYZENITH has written off. */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {(
              [
                { key: "gulf", tier: "growth", index: "02" },
                { key: "centralAsia", tier: "emerging", index: "03" },
              ] as const
            ).map(({ key, tier, index }, i) => (
              <Reveal key={key} delay={0.05 + i * 0.05}>
                <article className="h-full rounded-lg border border-border bg-surface p-8">
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="font-mono text-caption tabular-nums text-accent"
                    >
                      {index}
                    </span>
                    <span aria-hidden="true" className={tierRule[tier]} />
                  </div>
                  <p className="eyebrow mt-6 text-accent">{t(`markets.${key}.label`)}</p>
                  <h3 className="mt-3 font-sans text-h4 font-semibold text-foreground">
                    {t(`markets.${key}.title`)}
                  </h3>
                  <p className="mt-5 text-body-lg text-foreground">
                    {t(`markets.${key}.countries`)}
                  </p>
                  {key === "gulf" ? (
                    <p className="mt-2 text-small text-subtle">
                      {t("markets.gulf.cities")}
                    </p>
                  ) : null}
                  <p className="mt-4 text-body text-muted">
                    {t(`markets.${key}.description`)}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Why AYZENITH — hairline-separated pairs, closing on the long view. */}
      <Section labelledBy="export-why-heading" tone="white">
        <Container>
          <Reveal>
            <SectionHeader
              headingId="export-why-heading"
              overline={t("why.overline")}
              title={t("why.title")}
            />
          </Reveal>

          <ul className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {advantages.map((item, index) => (
              <Reveal as="li" key={item} delay={index * 0.05}>
                <div className="border-t border-border pt-6">
                  <h3 className="font-sans text-h5 font-semibold text-foreground">
                    {t(`why.${item}.title`)}
                  </h3>
                  <p className="mt-3 text-body text-muted">
                    {t(`why.${item}.description`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={0.1}>
            <p className="measure-narrow mx-auto mt-16 text-balance text-center font-serif text-h4 italic leading-snug text-foreground">
              {t("why.closing")}
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* Page-specific close. The shared CTASection speaks for the site; this
          one speaks to a manufacturer deciding where to sell next, so it asks
          for the product and the markets by name. */}
      <Section
        labelledBy="export-cta-heading"
        size="lg"
        className="relative overflow-hidden border-t border-border"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(55%_80%_at_50%_120%,rgba(201,162,39,0.1),transparent_70%)]"
        />
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="eyebrow text-accent">{t("cta.overline")}</p>
            <h2
              id="export-cta-heading"
              className="mt-6 text-balance font-sans text-h2 font-semibold text-foreground"
            >
              {t("cta.title")}
            </h2>
            <p className="measure mx-auto mt-6 text-body-lg text-muted">
              {t("cta.subtitle")}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button asChild size="lg">
                <Link href="/contact">{t("cta.primary")}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/contact">{t("cta.secondary")}</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
