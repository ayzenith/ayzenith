import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ContactForm } from "@/components/sections/contact-form";

/**
 * Contact — The Closing Invitation (Wireframe 08). Server Component wrapper.
 *
 * Reframes "contact us" as "start a partnership": warm, low-friction, with a
 * clear expectation set. Only the form itself is a Client island; the framing,
 * heading and reassurance are server-rendered and static.
 */
export async function Contact() {
  const t = await getTranslations("contact");

  return (
    <Section id="contact" labelledBy="contact-heading" size="lg" tone="white">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="eyebrow text-accent">{t("overline")}</p>
              <h2
                id="contact-heading"
                className="mt-6 text-balance font-sans text-h1 font-semibold leading-[1.1] text-foreground"
              >
                {t("title")}
              </h2>
              <p className="mt-6 text-body-lg text-muted">{t("subtitle")}</p>
            </div>
          </Reveal>

          <Reveal>
            <ContactForm />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
