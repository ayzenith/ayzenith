import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth";
import { RADAR_CATEGORIES, COUNTRY_LABELS } from "@/config/radar";
import { getRadarSettings } from "@/server/radar/settings";
import { verifiedCountByCategory } from "@/server/radar/hs";
import { PageHeader } from "@/components/admin/page-header";
import { NewAnalysisForm } from "@/components/admin/radar/new-analysis-form";

export const metadata: Metadata = { title: "Yeni Analiz · RADAR", robots: { index: false, follow: false } };

export const maxDuration = 120;

export default async function NewAnalysisPage() {
  await requireRole("ADMIN");
  const [settings, verified] = await Promise.all([
    getRadarSettings(),
    verifiedCountByCategory(),
  ]);

  const categories = RADAR_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    verified: verified[c.key] ?? 0,
  }));

  const countries = Object.entries(COUNTRY_LABELS)
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));

  const regions = Object.entries(settings.regions).map(([key, r]) => ({
    key,
    label: r.label,
    count: r.countries.length,
  }));

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/radar" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> RADAR
        </Link>
      </div>
      <PageHeader title="Yeni Analiz" description="Bir kategori ve pazar seçin; gerisini RADAR halleder." />
      <NewAnalysisForm categories={categories} countries={countries} regions={regions} />
    </>
  );
}
