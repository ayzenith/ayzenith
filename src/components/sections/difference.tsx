import { getTranslations } from "next-intl/server";
import { Layers, ShieldCheck, KeyRound, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

/**
 * The Difference — Conviction + the one point of tension (Wireframe 05).
 * Server Component.
 *
 * Opens by naming the enemy (the anonymous middleman who disappears) — the
 * single quiet edge that makes the brand memorable — then resolves into the
 * three pillars. Conviction stated with certainty, never aggression.
 */

const pillars: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "consolidate", icon: Layers },
  { key: "derisk", icon: ShieldCheck },
  { key: "access", icon: KeyRound },
];

export async function Difference() {
  const t = await getTranslations("difference");

  return (
    <Section id="difference" labelledBy="difference-heading" tone="navy">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="eyebrow text-accent">{t("overline")}</p>
              <p className="mt-6 font-serif text-h4 italic leading-snug text-muted">
                {t("tension")}
              </p>
              <h2
                id="difference-heading"
                className="mt-6 text-balance font-sans text-h2 font-semibold text-foreground"
              >
                {t("title")}
              </h2>
            </div>
          </Reveal>

          <ul className="flex flex-col divide-y divide-border">
            {pillars.map(({ key, icon: Icon }, index) => (
              <Reveal as="li" key={key} delay={index * 0.06}>
                <div className="flex gap-6 py-8 first:pt-0">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md border border-border text-accent">
                    <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                  </span>
                  <div>
                    <h3 className="font-sans text-h5 font-semibold text-foreground">
                      {t(`pillars.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-body text-muted">
                      {t(`pillars.${key}.description`)}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
