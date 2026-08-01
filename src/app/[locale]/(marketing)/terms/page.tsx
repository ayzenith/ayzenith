import type { Metadata } from "next";
import { LegalPage } from "@/components/sections/legal-page";
import { termsConditions } from "@/content/legal";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: termsConditions.title,
    description: termsConditions.intro,
    path: "/terms",
  });
}

export default function TermsPage() {
  return <LegalPage doc={termsConditions} />;
}
