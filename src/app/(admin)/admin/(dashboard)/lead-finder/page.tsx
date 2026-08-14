import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Building2, ShoppingCart, ArrowRight, Radar as RadarIcon } from "lucide-react";
import { requireRole } from "@/server/auth";
import { listSearches, getDataHealth } from "@/server/leads/leads";
import { PageHeader } from "@/components/admin/page-header";
import { fmtDate, flagEmoji } from "@/components/admin/leads/ui";

export const metadata: Metadata = { title: "Lead Finder · AYZENITH", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LeadFinderPage() {
  await requireRole("ADMIN");
  const [searches, health] = await Promise.all([listSearches(), getDataHealth()]);

  return (
    <>
      <PageHeader
        title="Lead Finder"
        description="Bir ülke ve ürün için gerçek, doğrulanabilir alıcı ve satış kanalı adaylarını keşfedin, sınıflandırın ve önceliklendirin. Tüm veriler kaynaklıdır; hiçbir firma veya iletişim bilgisi uydurulmaz."
        actions={
          <Link
            href="/admin/lead-finder/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy-950 px-5 text-body font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" aria-hidden="true" /> Yeni Arama
          </Link>
        }
      />

      {/* Data Health (§23) */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard label="Toplam lead" value={health.total} />
        <HealthCard label="🟢 Güncel" value={health.fresh} />
        <HealthCard label="🟡 Yeniden doğrulama" value={health.recheck} />
        <HealthCard label="🔴 Eski / doğrulanamadı" value={health.stale} />
      </section>

      {/* Recent searches */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-h6 font-semibold text-foreground">Geçmiş Aramalar</h2>
        </div>

        {searches.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-sunken p-8 text-center">
            <p className="text-small text-muted">Henüz arama yapılmadı.</p>
            <Link
              href="/admin/lead-finder/new"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden="true" /> İlk aramayı başlat
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {searches.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/lead-finder/${s.id}`}
                  className="flex items-center gap-4 py-3 transition-colors hover:bg-surface-sunken/60 -mx-2 px-2 rounded-lg"
                >
                  <span className="text-lg" aria-hidden="true">{flagEmoji(s.country)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-foreground">
                      {s.productQuery}
                      {s.city ? <span className="text-subtle"> · {s.city}</span> : null}
                    </p>
                    <p className="flex items-center gap-2 text-caption text-subtle">
                      <span className="inline-flex items-center gap-1">
                        {s.businessModel === "B2B" ? <Building2 className="size-3" aria-hidden="true" /> : <ShoppingCart className="size-3" aria-hidden="true" />}
                        {s.businessModel}
                      </span>
                      · {s.countryLabel}
                      {s.radarSnapshotId ? <span className="inline-flex items-center gap-1 text-[#2f7a48]"><RadarIcon className="size-3" aria-hidden="true" /> RADAR</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-small font-semibold tabular-nums text-foreground">{s.totalDiscovered}</p>
                    <p className="text-caption text-subtle">{fmtDate(s.createdAt)}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function HealthCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-caption text-subtle">{label}</p>
      <p className="mt-1 text-h4 font-semibold tabular-nums text-foreground">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}
