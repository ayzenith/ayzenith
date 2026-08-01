import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

/**
 * CTASection — the reusable closing partnership band shared by every interior
 * page. Server Component. One canonical conversion path ("Start a Partnership"
 * → /contact), so the CTA is identical and consistent site-wide.
 */
export async function CTASection() {
  const t = await getTranslations("cta");

  return (
    <Section
      labelledBy="cta-heading"
      size="lg"
      className="relative overflow-hidden border-t border-border"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(55%_80%_at_50%_120%,rgba(201,162,39,0.1),transparent_70%)]"
      />
      <Container>
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow text-accent">{t("overline")}</p>
          <h2
            id="cta-heading"
            className="mt-6 text-balance font-sans text-h2 font-semibold text-foreground"
          >
            {t("title")}
          </h2>
          <p className="measure mx-auto mt-6 text-body-lg text-muted">{t("subtitle")}</p>
          <div className="mt-10">
            <Button asChild size="lg">
              <Link href="/contact">{t("button")}</Link>
            </Button>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
