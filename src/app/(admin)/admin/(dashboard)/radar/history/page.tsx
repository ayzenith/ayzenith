import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { requireRole } from "@/server/auth";
import { listSnapshotsForMarket, compareSnapshots } from "@/server/radar/snapshot";
import { RADAR_CATEGORIES, COUNTRY_LABELS } from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { ScoreChip } from "@/components/admin/radar/score-badge";
import { fmtDate, BAND, type Decision } from "@/components/admin/radar/ui";

export const metadata: Metadata = { title: "Analiz Geçmişi · RADAR", robots: { index: false, follow: false } };

function categoryLabel(key: string): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; country?: string }>;
}) {
  await requireRole("ADMIN");
  const { category, country } = await searchParams;
  if (!category || !country) {
    return (
      <>
        <PageHeader title="Analiz Geçmişi" description="Kategori ve ülke belirtilmedi." />
        <Link href="/admin/radar" className="text-small text-accent underline">RADAR'a dön</Link>
      </>
    );
  }

  const snaps = await listSnapshotsForMarket(category, country.toUpperCase(), 12);
  const label = `${COUNTRY_LABELS[country.toUpperCase()] ?? country} · ${categoryLabel(category)}`;

  // Compare within the SAME business model AND the SAME analysis scope as the
  // latest analysis — B2B/B2C are different perspectives, and a category analysis
  // must never be compared to a single-product one (or to a different product).
  const current = snaps[0] ?? null;
  const currentModel = current?.tradeModel ?? "B2B";
  const currentType = current?.analysisType ?? "category";
  const currentHs = current?.hsCode ?? null;
  const previous =
    snaps.slice(1).find(
      (s) =>
        s.tradeModel === currentModel &&
        (s.analysisType ?? "category") === currentType &&
        (currentType !== "product" || s.hsCode === currentHs),
    ) ?? null;
  const scopeLabel =
    currentType === "product" ? `Ürün: ${current?.productName ?? "—"}` : "Kategori analizi";
  const cmp = current
    ? compareSnapshots(
        { finalScore: current.finalScore, criteria: current.criteria },
        previous ? { finalScore: previous.finalScore, criteria: previous.criteria } : null,
      )
    : null;

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/radar" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> RADAR
        </Link>
      </div>
      <PageHeader title="Analiz Geçmişi" description={label} />

      {/* Comparison card */}
      {cmp && current ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h6 font-semibold text-foreground">Son iki analiz · {currentModel} · {scopeLabel}</h2>
          {previous ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <span className="text-h4 font-bold tabular-nums text-muted">{cmp.previousScore ?? "—"}</span>
                <span className="text-subtle">→</span>
                <span className="text-h3 font-bold tabular-nums text-foreground">{cmp.currentScore ?? "—"}</span>
                {cmp.scoreDelta != null ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-small font-semibold"
                    style={{
                      color: cmp.direction === "up" ? BAND.WORTH_RESEARCHING.fg : cmp.direction === "down" ? BAND.NOT_PRIORITY.fg : "#5b5b5b",
                      backgroundColor: cmp.direction === "up" ? BAND.WORTH_RESEARCHING.bg : cmp.direction === "down" ? BAND.NOT_PRIORITY.bg : "#f1f0ee",
                    }}
                  >
                    {cmp.direction === "up" ? <TrendingUp className="size-4" /> : cmp.direction === "down" ? <TrendingDown className="size-4" /> : <Minus className="size-4" />}
                    {cmp.scoreDelta > 0 ? "+" : ""}{cmp.scoreDelta} puan
                  </span>
                ) : null}
              </div>
              {cmp.reasons.length > 0 ? (
                <div className="mt-4">
                  <p className="text-caption font-medium uppercase tracking-wide text-subtle">Ana değişim (gerçek veriden)</p>
                  <ul className="mt-2 space-y-1">
                    {cmp.reasons.map((r, i) => (
                      <li key={i} className="text-small text-foreground/90">• {r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-small text-subtle">İki analiz arasında kayda değer bir veri değişikliği yok.</p>
              )}
            </>
          ) : (
            <p className="mt-4 text-small text-subtle">
              Karşılaştırma için henüz ikinci bir analiz yok. Bu pazarı takibe alıp yenilediğinizde
              buraya değişim gelir.
            </p>
          )}
        </section>
      ) : null}

      {/* Full history list */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-h6 font-semibold text-foreground">Tüm analizler</h2>
        {snaps.length === 0 ? (
          <p className="mt-3 text-small text-subtle">Bu pazar için kayıt yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {snaps.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/radar/analysis/${s.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                  <ScoreChip decision={s.decision as Decision} score={s.finalScore} />
                  <div className="min-w-0 flex-1">
                    <span className="text-small text-foreground">{fmtDate(s.createdAt)}</span>
                    {s.analysisType === "product" ? (
                      <span className="block truncate text-caption text-subtle">Ürün: {s.productName ?? "—"} · HS {s.hsCode ?? "—"}</span>
                    ) : null}
                  </div>
                  <span className="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                    {s.analysisType === "product" ? "Ürün" : "Kategori"}
                  </span>
                  <span className="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{s.tradeModel}</span>
                  <span className="text-caption text-subtle">veri güveni %{s.confidence}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
