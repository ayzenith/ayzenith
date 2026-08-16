import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/sections/hero";
import { Belief } from "@/components/sections/belief";
import { Capabilities } from "@/components/sections/capabilities";
import { Process } from "@/components/sections/process";
import { Difference } from "@/components/sections/difference";
import { Proof } from "@/components/sections/proof";
import { Vision } from "@/components/sections/vision";
import { Contact } from "@/components/sections/contact";
import { buildMetadata } from "@/lib/seo";

/**
 * Homepage — the digital headquarters. Chrome comes from the marketing layout;
 * this file owns only the eight approved wireframe sections, in exact order.
 * Statically rendered.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // No `title` → the brand-first default ("AYZENITH — Global Trade. Absolute
  // Trust.") is used, avoiding a doubled brand name in the homepage title.
  return buildMetadata({
    fullTitle: t("homeTitle"),
    description: t("homeDescription"),
    path: "/",
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Declaring the locale is what keeps this page statically rendered.
  setRequestLocale((await params).locale);
  return (
    <>
      {/* 01 · Hero — The Statement */}
      <Hero />
      {/* 02 · Belief / Problem–Promise — Recognition */}
      <Belief />
      {/* 03 · Capabilities — Breadth at a glance */}
      <Capabilities />
      {/* 04 · How We Work — The Trust Engine */}
      <Process />
      {/* 05 · The Difference — Conviction + tension */}
      <Difference />
      {/* 06 · Proof & Presence — Validation */}
      <Proof />
      {/* 07 · The Ascent / Vision — The Signature Moment */}
      <Vision />
      {/* 08 · Contact — The Closing Invitation */}
      <Contact />
    </>
  );
}
