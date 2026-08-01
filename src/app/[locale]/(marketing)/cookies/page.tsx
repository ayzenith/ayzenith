import type { Metadata } from "next";
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

export default function CookiesPage() {
  return <LegalPage doc={cookiePolicy} />;
}
