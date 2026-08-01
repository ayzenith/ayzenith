import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

/**
 * The Ascent / Vision — The Signature Moment (Wireframe 07). Server Component.
 *
 * The emotional peak, given the most space: where the zenith metaphor pays off,
 * the future-tense energy lands, and a human pulse (the quote) breaks the
 * immaculate surface. Reframes "young" as "ascendant". The gold glow is
 * pure CSS — the drama is typographic and spatial, not asset-heavy.
 */
export async function Vision() {
  const t = await getTranslations("vision");

  return (
    <Section
      id="company"
      labelledBy="vision-heading"
      size="lg"
      tone="navy"
      className="overflow-hidden"
    >
      {/* Restrained gold ascent glow rising from the lower center — CSS only.
          Sits above the section's navy fill; content renders over it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-2/3 bg-[radial-gradient(60%_80%_at_50%_120%,rgba(201,162,39,0.12),transparent_70%)]"
      />

      <Container>
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="eyebrow text-accent">{t("overline")}</p>

          <h2
            id="vision-heading"
            className="mt-6 text-balance font-sans text-h1 font-semibold leading-[1.1] text-foreground"
          >
            {t("title")}
          </h2>

          <p className="measure mx-auto mt-8 text-body-lg text-muted">{t("body")}</p>

          <figure className="mt-14">
            <blockquote className="mx-auto max-w-2xl">
              <p className="text-balance font-serif text-h4 italic leading-snug text-foreground">
                “{t("quote")}”
              </p>
            </blockquote>
          </figure>

          <div className="mt-12">
            <Button asChild size="lg">
              <Link href="/#contact">{t("cta")}</Link>
            </Button>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
