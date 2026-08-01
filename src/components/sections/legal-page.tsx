import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { PageHero } from "@/components/ui/page-hero";
import type { LegalDocument } from "@/content/legal";

/**
 * LegalPage — the shared renderer for every legal document. Server Component.
 * Renders one <h1> (via PageHero) and semantic <h2> per section, constrained to
 * a comfortable reading measure. Swapping in counsel-reviewed copy is a content
 * change in content/legal.ts — this renderer never changes.
 */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <PageHero eyebrow="Legal" title={doc.title} subtitle={doc.intro} />

      <Section labelledBy="legal-heading">
        <Container>
          <h2 id="legal-heading" className="sr-only">
            {doc.title}
          </h2>

          <p className="text-small text-subtle">Last updated: {doc.updated}</p>

          <div className="measure mt-10 flex flex-col gap-10">
            {doc.sections.map((section) => (
              <section key={section.heading}>
                <h3 className="font-sans text-h5 font-semibold text-foreground">
                  {section.heading}
                </h3>
                {section.body.map((paragraph, index) => (
                  <p key={index} className="mt-4 text-body text-muted">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <p className="measure mt-12 border-t border-border pt-6 text-caption text-subtle">
            {doc.disclaimer}
          </p>
        </Container>
      </Section>
    </>
  );
}
