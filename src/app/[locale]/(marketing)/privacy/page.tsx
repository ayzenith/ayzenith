import type { Metadata } from "next";
import { LegalPage } from "@/components/sections/legal-page";
import { privacyPolicy } from "@/content/legal";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: privacyPolicy.title,
    description: privacyPolicy.intro,
    path: "/privacy",
  });
}

export default function PrivacyPage() {
  return <LegalPage doc={privacyPolicy} />;
}
