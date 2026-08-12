import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { requireRole } from "@/server/auth";
import { analyzeMarket } from "@/server/radar/analyze";
import { getRadarSettings } from "@/server/radar/settings";
import { RADAR_CATEGORIES } from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { ScoreBadge } from "@/components/admin/radar/score-badge";
import { analyzeCountryAction } from "../actions";
import { type Decision } from "@/components/admin/radar/ui";

export const metadata: Metadata = { title: "Bölge Analizi · RADAR", robots: { index: false, follow: false } };

// Region analysis fans out live calls over several countries — give it room.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const REGION_CAP = 8; // bound the fan-out; ranks the region's leading markets.

function categoryLabel(key: string): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
function flagEmoji(cc: string): string {
  if (cc.length !== 2) return "🌍";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

export default async function RegionPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; region?: string; model?: string }>;
}) {
  await requireRole("ADMIN");
  const { category, region, model } = await searchParams;
  const tradeModel = model === "B2C" ? "B2C" : "B2B";
  const settings = await getRadarSettings();

  const regionDef = region ? settings.regions[region] : undefined;
  const categoryKey = category ?? "";

  if (!regionDef || !categoryKey) {
    return (
      <>
        <PageHeader title="Bölge Analizi" description="Geçersiz bölge veya kategori." />
        <Link href="/admin/radar/new" className="text-small text-accent underline">Yeni analize dön</Link>
      </>
    );
  }

  const countries = regionDef.countries.slice(0, REGION_CAP);

  // DATA layer only — no snapshots saved, no AI. Exploratory ranking.
  const results = await Promise.all(
    countries.map(async (cc) => {
      try {
        const r = await analyzeMarket({ categoryKey, countryCode: cc, geoScope: "region", tradeModel });
        return { cc, ok: true as const, r };
      } catch {
        return { cc, ok: false as const, r: null };
      }
    }),
  );

  const ranked = results
    .filter((x) => x.ok && x.r)
    .map((x) => x.r!)
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/radar/new" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Yeni Analiz
        </Link>
      </div>
      <PageHeader
        title={`${regionDef.label} — Bölge Taraması`}
        description={`${categoryLabel(categoryKey)} · ${tradeModel} · ${ranked.length} pazar en yüksek fırsattan sıralandı. Bu bir ön tarama; bir ülkeye tıklayıp tam (kaydedilen) analizi çalıştırın.`}
      />

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <ul className="divide-y divide-border">
          {ranked.map((r, i) => (
            <li key={r.countryCode} className="flex items-center gap-4 py-3.5">
              <span className="w-6 shrink-0 text-center text-small font-bold tabular-nums text-subtle">{i + 1}</span>
              <span className="text-h5" aria-hidden="true">{flagEmoji(r.countryCode)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-foreground">{r.countryLabel}</p>
                <p className="text-caption text-subtle">
                  {r.finalScore != null
                    ? `Veri güveni %${r.confidence} · ${r.measuredCriteria}/5 kriter`
                    : "Veri yetersiz — skor üretilmedi"}
                </p>
              </div>
              <ScoreBadge decision={r.decision as Decision} score={r.finalScore} />
              <form action={analyzeCountryAction}>
                <input type="hidden" name="categoryKey" value={categoryKey} />
                <input type="hidden" name="countryCode" value={r.countryCode} />
                <input type="hidden" name="tradeModel" value={tradeModel} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  Tam analiz <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </form>
            </li>
          ))}
        </ul>
        {ranked.length === 0 ? (
          <p className="py-6 text-center text-small text-subtle">Bu bölge için sonuç alınamadı.</p>
        ) : null}
      </section>
    </>
  );
}
