import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { HeroComposition } from "@/components/sections/hero-composition";

/**
 * Hero — The Statement (Wireframe 01). Server Component, fully static.
 *
 * Premium light-neutral surface (not white, not dark): a refined gradient with
 * subtle depth and a barely-there grid. The <h1> is the LCP element — plain
 * server text with a swap font, no entrance animation. The right column carries
 * an abstract, replaceable composition so the layout reads balanced, never
 * left-heavy. 5-second test: serious, international, calm, expensive.
 */
export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[92svh] items-center overflow-hidden"
    >
      <HeroBackdrop />

      <Container className="relative z-10 pt-32 pb-24 md:pt-36">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Text column */}
          <div className="max-w-2xl">
            <p className="eyebrow text-accent">{t("eyebrow")}</p>

            <h1
              id="hero-title"
              className="mt-8 text-balance font-sans text-display font-semibold leading-[var(--text-display--line-height)] tracking-[var(--text-display--letter-spacing)] text-foreground"
            >
              {t("title")}
            </h1>

            <p className="mt-8 max-w-xl text-body-lg text-muted">{t("subtitle")}</p>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/contact">{t("primaryCta")}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/services">{t("secondaryCta")}</Link>
              </Button>
            </div>
          </div>

          {/* Composition column — balances the layout; replaceable with CGI. */}
          <div className="hidden lg:block">
            <HeroComposition />
          </div>
        </div>
      </Container>

      {/* Static scroll cue — orients without decoration or motion cost. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center"
      >
        <span className="eyebrow text-subtle">{t("scroll")}</span>
      </div>
    </section>
  );
}

/**
 * Pure-CSS premium light backdrop: a soft neutral gradient with directional
 * depth, a single restrained gold glint, a whisper of navy in the far corner,
 * and a much-reduced precision grid (larger cells, very low opacity, heavily
 * masked). No assets, no JavaScript.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-offwhite">
      {/* Neutral depth: near-white lifting to a cool light gray. */}
      <div className="absolute inset-0 bg-[linear-gradient(165deg,#ffffff_0%,#f5f7fa_58%,#eef1f5_100%)]" />

      {/* Reduced grid — a whisper, not a pattern. */}
      <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(18,50,82,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(18,50,82,0.035)_1px,transparent_1px)] [background-size:96px_96px] [mask-image:radial-gradient(120%_90%_at_85%_10%,#000_0%,transparent_70%)]" />

      {/* Restrained gold glint, upper-left (reading origin). */}
      <div className="absolute inset-0 bg-[radial-gradient(38%_32%_at_10%_-5%,rgba(201,162,39,0.08),transparent_70%)]" />

      {/* A whisper of navy depth, far right. */}
      <div className="absolute inset-0 bg-[radial-gradient(45%_45%_at_100%_0%,rgba(10,26,47,0.06),transparent_70%)]" />

      {/* Blend into the page background below. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent,var(--color-background))]" />
    </div>
  );
}
