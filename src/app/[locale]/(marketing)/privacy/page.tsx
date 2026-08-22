import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/sections/legal-page";
import { privacyPolicy } from "@/content/legal";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Metadata is generated BEFORE the component body runs, so the locale has to
  // be declared here as well. Without it next-intl falls back to reading request
  // headers, which opts the whole route out of static rendering.
  setRequestLocale((await params).locale);

  return buildMetadata({
    title: privacyPolicy.title,
    description: privacyPolicy.intro,
    path: "/privacy",
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  setRequestLocale((await params).locale);
  return <LegalPage doc={privacyPolicy} />;
}
