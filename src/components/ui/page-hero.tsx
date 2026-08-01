import { Container } from "@/components/ui/container";

/**
 * PageHero — the shared hero for every interior page (About, Services,
 * Products, Contact). Server Component. Each interior page owns exactly one
 * <h1>; this renders it with a consistent eyebrow + subtitle and the same
 * pure-CSS navy field as the homepage (no asset weight, no layout shift).
 */

type PageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
};

export function PageHero({ eyebrow, title, subtitle }: PageHeroProps) {
  return (
    <section
      aria-labelledby="page-hero-title"
      className="relative isolate overflow-hidden pb-16 pt-36 md:pb-24 md:pt-44"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-offwhite">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#ffffff_0%,#f5f7fa_60%,#eef1f5_100%)]" />
        <div className="absolute inset-0 opacity-[0.3] [background-image:linear-gradient(rgba(18,50,82,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(18,50,82,0.035)_1px,transparent_1px)] [background-size:96px_96px] [mask-image:radial-gradient(120%_90%_at_85%_10%,#000_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(38%_34%_at_12%_-8%,rgba(201,162,39,0.08),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,var(--color-background))]" />
      </div>

      <Container className="relative z-10">
        <div className="max-w-3xl">
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h1
            id="page-hero-title"
            className="mt-6 text-balance font-sans text-h1 font-semibold leading-[1.06] text-foreground"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-6 max-w-2xl text-body-lg text-muted">{subtitle}</p>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
