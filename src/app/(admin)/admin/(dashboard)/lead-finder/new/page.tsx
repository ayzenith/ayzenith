import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth";
import { COUNTRY_LABELS } from "@/config/leads";
import { PageHeader } from "@/components/admin/page-header";
import { SearchForm, type SearchPrefill } from "@/components/admin/leads/search-form";

export const metadata: Metadata = { title: "Yeni Arama · Lead Finder", robots: { index: false, follow: false } };

// Discovery fans out live calls across several cities + website verification —
// give the request room (same pattern as RADAR's region analysis).
export const maxDuration = 300;

export default async function NewSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    country?: string; product?: string; model?: string;
    snapshot?: string; category?: string; hs6?: string;
    score?: string; decision?: string;
  }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;

  const countries = Object.entries(COUNTRY_LABELS)
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));

  const prefill: SearchPrefill = {
    countryCode: sp.country?.toUpperCase(),
    productQuery: sp.product,
    businessModel: sp.model === "B2C" ? "B2C" : sp.model === "B2B" ? "B2B" : undefined,
    radarSnapshotId: sp.snapshot,
    categoryKey: sp.category,
    hs6: sp.hs6,
    radarScore: sp.score,
    radarDecision: sp.decision,
  };

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/lead-finder" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Lead Finder
        </Link>
      </div>
      <PageHeader title="Yeni Arama" description="Ülke, ürün ve ticari modeli seçin; gerisini Lead Finder halleder." />
      <SearchForm countries={countries} prefill={prefill} />
    </>
  );
}
