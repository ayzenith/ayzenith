import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

/**
 * Belief / Problem–Promise — Recognition (Wireframe 02). Server Component.
 *
 * The single most important non-hero block: it states the ownable belief (the
 * brand's point of view) and reflects the visitor's problem back to them, so
 * "impressive" becomes "relevant to me". Quiet, wide, centered — the belief is
 * set in the editorial serif to carry conviction and warmth.
 */
export async function Belief() {
  const t = await getTranslations("belief");

  return (
    <Section id="belief" labelledBy="belief-heading" size="lg" tone="white">
      <Container>
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="eyebrow text-accent">{t("overline")}</p>

          <h2
            id="belief-heading"
            className="mt-6 text-balance font-serif text-h2 font-medium leading-[1.15] text-foreground"
          >
            {t("belief")}
          </h2>

          <div className="mx-auto mt-10 grid max-w-3xl gap-6 text-left sm:grid-cols-2">
            <p className="text-body-lg text-muted">{t("problem")}</p>
            <p className="text-body-lg text-foreground">{t("promise")}</p>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
