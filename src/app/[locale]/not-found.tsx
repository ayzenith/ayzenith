import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";

/**
 * Localized 404 (Website Experience Blueprint). Server Component, self-contained
 * — its own navy canvas (data-theme="dark" so tokens resolve for the dark
 * surface) and a single clear route home. On-brand, calm, never blaming.
 */
export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div
      data-theme="dark"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-navy-950"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#050b14,#0a1a2f)]" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_40%_at_50%_0%,rgba(201,162,39,0.1),transparent_70%)]" />
      </div>

      <Container className="relative z-10 text-center">
        <Link
          href="/"
          aria-label={t("backHome")}
          className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ring)]"
        >
          <Logo tone="light" alt="" sizes="220px" className="mx-auto h-12" />
        </Link>

        <p className="eyebrow mt-12 text-accent">{t("notFoundEyebrow")}</p>
        <h1 className="mt-5 text-balance font-sans text-h1 font-semibold text-foreground">
          {t("notFoundTitle")}
        </h1>
        <p className="measure mx-auto mt-5 text-body-lg text-muted">
          {t("notFoundBody")}
        </p>

        <div className="mt-10">
          <Button asChild size="lg">
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
