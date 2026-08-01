import { getTranslations } from "next-intl/server";
import {
  ShieldCheck,
  Search,
  BadgeCheck,
  Ship,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/ui/reveal";

/**
 * How We Work — The Trust Engine (Wireframe 04). Server Component.
 *
 * The psychological turning point: making the promise tangible dissolves the
 * "can I trust them with volume?" objection. Rendered as an ordered list (<ol>)
 * because the sequence itself carries meaning — screen readers announce it as
 * five ordered steps. A faint gold rail connects the nodes on desktop.
 */

const steps: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "vet", icon: ShieldCheck },
  { key: "source", icon: Search },
  { key: "control", icon: BadgeCheck },
  { key: "ship", icon: Ship },
  { key: "deliver", icon: PackageCheck },
];

export async function Process() {
  const t = await getTranslations("process");

  return (
    <Section id="process" labelledBy="process-heading" tone="gray">
      <Container>
        <Reveal>
          <SectionHeader
            headingId="process-heading"
            overline={t("overline")}
            title={t("title")}
            intro={t("intro")}
          />
        </Reveal>

        <div className="relative mt-16">
          {/* Connective rail behind the nodes — desktop only, decorative.
              Kept a sibling of the <ol> so the list contains only <li>. */}
          <div
            aria-hidden="true"
            className="hairline-gold absolute left-0 right-0 top-7 hidden h-px md:block"
          />

          <ol className="grid gap-10 md:grid-cols-5 md:gap-6">
            {steps.map(({ key, icon: Icon }, index) => (
            <Reveal as="li" key={key} delay={index * 0.06} className="relative">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-6">
                <span className="relative z-10 inline-flex size-14 shrink-0 items-center justify-center rounded-md border border-navy-800 bg-navy-900 text-gold-500 shadow-sm">
                  <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                </span>
                <span
                  className="font-mono text-caption tabular-nums text-subtle"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <h3 className="mt-5 font-sans text-h6 font-semibold text-foreground">
                {t(`steps.${key}.title`)}
              </h3>
              <p className="mt-2 text-small text-muted">
                {t(`steps.${key}.description`)}
              </p>
            </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
