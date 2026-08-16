import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/sections/legal-page";
import { cookiePolicy } from "@/content/legal";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: cookiePolicy.title,
    description: cookiePolicy.intro,
    path: "/cookies",
  });
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  setRequestLocale((await params).locale);
  return <LegalPage doc={cookiePolicy} />;
}
