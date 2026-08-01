import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/ui/reveal";

/**
 * Proof & Presence — Validation (Wireframe 06). Server Component.
 *
 * Confirms the case with honest, current figures — never inflated (the note
 * makes that discipline explicit and is architected to grow as real proof
 * accrues). Stats use a <dl>: each value is a description of its label, read
 * naturally by assistive tech, with tabular figures for precise alignment.
 * Static by design — no count-up client JS is needed to convey a number.
 */

const stats = ["reach", "categories", "accountability", "standard"] as const;

export async function Proof() {
  const t = await getTranslations("proof");

  return (
    <Section id="proof" labelledBy="proof-heading" tone="white">
      <Container>
        <Reveal>
          <SectionHeader
            headingId="proof-heading"
            overline={t("overline")}
            title={t("title")}
            intro={t("intro")}
          />
        </Reveal>

        <Reveal>
          <dl className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((key) => (
              <div
                key={key}
                className="flex flex-col-reverse gap-2 border-t border-border pt-6"
              >
                <dt className="text-small text-muted">
                  {t(`stats.${key}.label`)}
                </dt>
                <dd className="font-sans text-h2 font-semibold tabular-nums text-foreground">
                  {t(`stats.${key}.value`)}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal>
          <p className="measure mt-12 text-small text-subtle">{t("note")}</p>
        </Reveal>
      </Container>
    </Section>
  );
}
