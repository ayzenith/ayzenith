import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { TradeNetwork, TradeNetworkLegend } from "@/components/ui/trade-network";

/**
 * ExportHero — the first viewport of the export page.
 *
 * WHY NOT PageHero: the shared hero is a single left-aligned column, which is
 * right for pages whose job is to name themselves. This page has to answer
 * what / for whom / where / why before a visitor scrolls, and that needs a
 * second column. Rather than grow the shared component with a branch every
 * other page would carry for nothing, this one lives beside the page it serves
 * — same field, same type scale, same tokens.
 *
 * The corridor diagram is the load-bearing element: it says "Europe first, the
 * Gulf next, Central Asia under review" in one glance. The strip along the
 * bottom names the commercial flow AYZENITH takes on, so the hero closes with
 * scope rather than decoration.
 *
 * Server Component; the only client JS is the shared Reveal.
 */
export async function ExportHero() {
  const t = await getTranslations("export.hero");

  const flow = ["entry", "buyers", "export", "logistics", "collection"] as const;

  // Shared by the diagram and its legend, so the two can never drift apart.
  const regions = {
    origin: t("network.origin"),
    europe: t("network.europe"),
    gulf: t("network.gulf"),
    centralAsia: t("network.centralAsia"),
  };

  return (
    <section
      aria-labelledby="page-hero-title"
      className="relative isolate overflow-hidden pb-12 pt-28 md:pb-14 md:pt-36"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-offwhite">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#ffffff_0%,#f5f7fa_60%,#eef1f5_100%)]" />
        <div className="absolute inset-0 opacity-[0.3] [background-image:linear-gradient(rgba(18,50,82,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(18,50,82,0.035)_1px,transparent_1px)] [background-size:96px_96px] [mask-image:radial-gradient(120%_90%_at_85%_10%,#000_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(38%_34%_at_12%_-8%,rgba(201,162,39,0.08),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,var(--color-background))]" />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-16">
          {/* Positioning */}
          <Reveal>
            <div>
              <p className="eyebrow text-accent">{t("eyebrow")}</p>

              <h1
                id="page-hero-title"
                className="mt-6 text-balance font-sans text-h1 font-semibold leading-[1.06] text-foreground"
              >
                {t("title")}
              </h1>

              {/* The proposition the page is known for, kept as a marked line
                  rather than a headline it would now compete with. */}
              <p className="mt-7 border-l-2 border-l-gold-500 pl-5 font-serif text-h5 italic leading-snug text-foreground">
                {t("proposition")}
              </p>

              <p className="mt-7 max-w-xl text-body-lg text-muted">{t("subtitle")}</p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button asChild size="lg">
                  <Link href="/contact">{t("ctaPrimary")}</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#approach">{t("ctaSecondary")}</a>
                </Button>
              </div>
            </div>
          </Reveal>

          {/* Commercial corridors — focus regions, not premises.
              Framed as a board rather than left floating: a titled panel with a
              ruled header and its key along the bottom reads as an instrument
              the company works from, which is the difference between looking
              like a trading house and looking like a consultancy with a nice
              illustration. */}
          <Reveal delay={0.1}>
            <figure className="mx-auto max-w-[34rem] rounded-lg border border-border bg-surface/70 p-5 shadow-sm md:p-6 lg:max-w-none">
              <figcaption className="border-b border-border pb-4">
                <span className="eyebrow text-foreground">{t("network.panel")}</span>
              </figcaption>

              <TradeNetwork
                className="mt-2"
                labels={{ caption: t("network.caption"), ...regions }}
              />

              <TradeNetworkLegend
                labels={regions}
                className="border-t border-border pt-4"
              />
            </figure>
          </Reveal>
        </div>

        {/* What AYZENITH carries, end to end. A signal, not a diagram. */}
        <Reveal delay={0.16}>
          <ol className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-border pt-6 md:gap-x-5">
            {flow.map((step, index) => (
              <li key={step} className="flex items-center gap-3 md:gap-5">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="h-px w-5 bg-border-strong md:w-8"
                  />
                ) : null}
                <span className="eyebrow whitespace-nowrap text-subtle">
                  {t(`flow.${step}`)}
                </span>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  );
}
