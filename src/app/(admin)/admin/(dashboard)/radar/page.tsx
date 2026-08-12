import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Radar, TrendingUp, TrendingDown, Eye, History, ArrowRight } from "lucide-react";
import { requireRole } from "@/server/auth";
import { getRadarDashboard } from "@/server/radar/dashboard";
import { getRadarSettings } from "@/server/radar/settings";
import { decideBand } from "@/server/radar/scoring";
import { RADAR_CATEGORIES } from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { ScoreChip } from "@/components/admin/radar/score-badge";
import { WatchList, type WatchItem } from "@/components/admin/radar/watch-list";
import { fmtDate, type Decision } from "@/components/admin/radar/ui";

export const metadata: Metadata = { title: "RADAR · AYZENITH", robots: { index: false, follow: false } };

function categoryLabel(key: string): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function decisionOf(score: number | null, thresholds: { worth: number; monitor: number }): Decision {
  if (score == null) return "INSUFFICIENT_DATA";
  return decideBand(score, thresholds);
}

export default async function RadarDashboardPage() {
  await requireRole("ADMIN");
  const [{ alerts, watches, recent }, settings] = await Promise.all([
    getRadarDashboard(),
    getRadarSettings(),
  ]);

  const watchItems: WatchItem[] = watches.map((w) => ({
    id: w.id,
    label: w.label,
    lastScore: w.lastScore,
    lastSnapshotId: w.lastSnapshotId,
    lastRefreshedAt: w.lastRefreshedAt ? w.lastRefreshedAt.toISOString() : null,
    decision: decisionOf(w.lastScore, settings.thresholds),
  }));

  return (
    <>
      <PageHeader
        title="AYZENITH RADAR"
        description="Kategori ve pazar seçin. RADAR resmi ticaret verilerini analiz ederek fırsat seviyesini hesaplasın. Tüm skorlar koda dayanır; hiçbir rakam uydurulmaz."
        actions={
          <Link
            href="/admin/radar/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy-950 px-5 text-body font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" aria-hidden="true" /> Yeni Analiz
          </Link>
        }
      />

      {/* Band legend — colour + text key */}
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-5 py-3 text-caption">
        <span className="flex items-center gap-2"><span>🟢</span> <b className="font-semibold text-foreground">80–100</b> Araştırmaya Değer</span>
        <span className="flex items-center gap-2"><span>🟡</span> <b className="font-semibold text-foreground">60–79</b> İzlenmeli</span>
        <span className="flex items-center gap-2"><span>🔴</span> <b className="font-semibold text-foreground">0–59</b> Şimdilik Öncelik Değil</span>
        <span className="flex items-center gap-2"><span>⚠</span> <b className="font-semibold text-foreground">Veri Yetersiz</b></span>
      </div>

      {/* Change alerts */}
      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Radar className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-h6 font-semibold text-foreground">Değişim Uyarıları</h2>
        </div>
        <p className="mt-1 text-caption text-subtle">
          Takip ettiğiniz pazarlarda skor {settings.alertThreshold} puan veya daha fazla değiştiğinde burada görünür.
        </p>
        {alerts.length === 0 ? (
          <p className="mt-4 text-small text-subtle">Şu an bir değişim uyarısı yok.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {alerts.map((a) => {
              const up = a.direction === "up";
              return (
                <li key={a.watchId} className="flex items-start gap-3 rounded-lg border border-border bg-surface-sunken p-4">
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: up ? "#eaf3ec" : "#fbeaea", color: up ? "#2f7a48" : "#8a2b2b" }}
                  >
                    {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-medium text-foreground">
                      {a.label} — <span style={{ color: up ? "#2f7a48" : "#8a2b2b" }}>{up ? "yükseliş" : "düşüş"} {a.delta > 0 ? "+" : ""}{a.delta} puan</span>
                    </p>
                    <p className="text-caption text-subtle">
                      {a.previousScore} → {a.currentScore}
                      {a.reasons.length > 0 ? ` · ${a.reasons.join(" · ")}` : ""}
                    </p>
                  </div>
                  <Link href={`/admin/radar/analysis/${a.snapshotId}`} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground">
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Watches */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-accent" aria-hidden="true" />
            <h2 className="text-h6 font-semibold text-foreground">Takip Ettiklerim</h2>
          </div>
          <p className="mt-1 text-caption text-subtle">
            Bu pazarlar haftalık otomatik ve “Şimdi Yenile” ile elle güncellenir.
          </p>
          <WatchList items={watchItems} />
        </section>

        {/* Recent */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <History className="size-4 text-accent" aria-hidden="true" />
            <h2 className="text-h6 font-semibold text-foreground">Son Analizler</h2>
          </div>
          <p className="mt-1 text-caption text-subtle">Kaydedilen son analizler.</p>
          {recent.length === 0 ? (
            <p className="mt-4 text-small text-subtle">Henüz analiz yok. “Yeni Analiz” ile başlayın.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/radar/analysis/${s.id}`} className="flex items-center gap-3 py-3 transition-colors hover:opacity-80">
                    <ScoreChip decision={s.decision as Decision} score={s.finalScore} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-medium text-foreground">
                        {s.countryLabel} · {categoryLabel(s.categoryKey)}
                      </p>
                      <p className="text-caption text-subtle">{fmtDate(s.createdAt)} · veri güveni %{s.confidence}</p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
