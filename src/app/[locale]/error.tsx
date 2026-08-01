"use client";

/**
 * Route error boundary (Next.js App Router). Client Component by requirement —
 * it receives the caught error and a `reset` callback to re-render the segment.
 * Runs inside the root layout, so the i18n provider is available. On-brand,
 * reassuring, with a retry and a route home. Never exposes error internals.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Surface for server/observability logs; analytics can hook in later.
    console.error(error);
  }, [error]);

  return (
    <div
      data-theme="dark"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-navy-950"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#050b14,#0a1a2f)]" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_40%_at_50%_0%,rgba(201,162,39,0.08),transparent_70%)]" />
      </div>

      <Container className="relative z-10 text-center">
        <p className="eyebrow text-accent">{t("errorEyebrow")}</p>
        <h1 className="mt-5 text-balance font-sans text-h1 font-semibold text-foreground">
          {t("errorTitle")}
        </h1>
        <p className="measure mx-auto mt-5 text-body-lg text-muted">
          {t("errorBody")}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button type="button" size="lg" onClick={reset}>
            {t("retry")}
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
