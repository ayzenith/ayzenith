import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ShieldCheck, Sparkles, Lightbulb, AlertTriangle,
  ChevronRight, ExternalLink, CheckCircle2, XCircle, History,
  TrendingUp, Target, Zap, GitCompareArrows, Info, Crosshair,
} from "lucide-react";
import { requireRole } from "@/server/auth";
import { getSnapshot } from "@/server/radar/snapshot";
import { listWatches } from "@/server/radar/watch";
import {
  CRITERION_LABELS, RADAR_CATEGORIES, DEFAULT_THRESHOLDS,
  B2C_UNMEASURED_SIGNALS, type RadarCriterionKey,
} from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { ScoreBadge, ScoreChip } from "@/components/admin/radar/score-badge";
import { WatchButton } from "@/components/admin/radar/watch-button";
import {
  BAND, confidenceDots, fmtUsd, fmtDate, countryName,
  RAW_INPUT_LABELS, BURDEN_LABELS, MODEL_LABELS, type Decision,
} from "@/components/admin/radar/ui";
import {
  deriveOpportunities, deriveRisks, deriveDataLimitations, fallbackMeaning, parseAiSummary,
  splitScores, concentrationInfo, deriveConflicts, deriveAnomalies, rankProducts,
  decisionConfidence, decisionActions, productVsMarketNote,
  type SnapshotCriterion, type SubCat,
} from "@/components/admin/radar/insights";

export const metadata: Metadata = { title: "Analiz · RADAR", robots: { index: false, follow: false } };

function categoryLabel(key: string): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function flagEmoji(cc: string): string {
  if (cc.length !== 2) return "🌍";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

/** Pick a decision band from a 0–100 score (for the twin-score cards). */
function scoreBand(score: number | null): Decision {
  if (score == null) return "INSUFFICIENT_DATA";
  if (score >= DEFAULT_THRESHOLDS.worth) return "WORTH_RESEARCHING";
  if (score >= DEFAULT_THRESHOLDS.monitor) return "MONITOR";
  return "NOT_PRIORITY";
}

type Citation = {
  provider: string;
  label: string;
  rawValue: string;
  unit: string | null;
  sourceUrl: string | null;
  fetchedAt: Date;
  query: unknown;
  criterionKeys?: unknown;
};

const PROVIDER_LABELS: Record<string, string> = {
  comtrade: "UN Comtrade",
  eurostat: "Eurostat",
  wits: "WITS / TRAINS",
};

/** A big number card used for Market Opportunity + AYZENITH Fit. */
function TwinCard({
  icon, title, score, subtitle,
}: {
  icon: React.ReactNode; title: string; score: number | null; subtitle: string;
}) {
  const b = BAND[scoreBand(score)];
  return (
    <section className="rounded-xl border p-6" style={{ backgroundColor: b.bg, borderColor: b.border }}>
      <div className="flex items-center gap-2 text-small font-medium" style={{ color: b.fg }}>
        {icon}{title}
      </div>
      {score == null ? (
        <p className="mt-2 text-h5 font-semibold" style={{ color: b.fg }}>Veri yetersiz</p>
      ) : (
        <>
          <p className="mt-1 font-serif text-[2.75rem] font-bold leading-none tabular-nums" style={{ color: b.fg }}>
            {score}<span className="text-h5 font-semibold text-muted"> / 100</span>
          </p>
          <p className="mt-2 text-caption font-semibold" style={{ color: b.fg }}>{b.dot} {b.label}</p>
        </>
      )}
      <p className="mt-2 text-caption text-subtle">{subtitle}</p>
    </section>
  );
}

export default async function AnalysisResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const snap = await getSnapshot(id);
  if (!snap) notFound();

  const criteria = (snap.criteria as unknown as SnapshotCriterion[]) ?? [];
  const subs = (snap.subCategories as unknown as SubCat[]) ?? [];
  const weights = (snap.weightsUsed as Record<string, number>) ?? {};
  const citations = (snap.citations as Citation[]) ?? [];
  const decision = snap.decision as Decision;
  const band = BAND[decision];
  const insufficient = decision === "INSUFFICIENT_DATA" || snap.finalScore == null;
  const model = snap.tradeModel === "B2C" ? "B2C" : "B2B";
  const isProduct = snap.analysisType === "product";
  const contextLine = isProduct
    ? `${snap.productName ?? "Ürün"} · HS ${snap.hsCode ?? "—"} · ${categoryLabel(snap.categoryKey)} · ${MODEL_LABELS[model] ?? model}`
    : `${categoryLabel(snap.categoryKey)} · Tedarik: ${snap.supplyMarket} · ${MODEL_LABELS[model] ?? model}`;

  const watches = await listWatches();
  const alreadyWatched = watches.some(
    (w) => w.categoryKey === snap.categoryKey && w.countryCode === snap.countryCode,
  );

  const ai = parseAiSummary(snap.aiSummary);
  const meaning = ai.ozet ?? fallbackMeaning(decision, snap.countryLabel, criteria, model);
  const opportunities = deriveOpportunities(criteria, subs);
  const risks = deriveRisks(criteria, snap.measuredCriteria, model);
  const dataLimitations = deriveDataLimitations(criteria, snap.measuredCriteria, model);
  // Raw provider warnings frozen on THIS snapshot (§ audit finding — previously
  // computed in analyze.ts and discarded before ever reaching the database, so
  // a partial-outage run looked identical to a fully-measured one on screen).
  const providerWarnings = Array.isArray(snap.errors) ? (snap.errors as unknown[]).filter((e): e is string => typeof e === "string") : [];

  // V1.1 intelligence — deterministic, from the frozen criteria.
  const twin = splitScores(criteria, weights);
  const conc = concentrationInfo(criteria);
  const conflicts = deriveConflicts(criteria);
  const anomalies = deriveAnomalies(criteria, subs);
  const products = rankProducts(subs, DEFAULT_THRESHOLDS.monitor);
  const topProduct = products.prioritize[0]?.sub ?? subs[0];
  // §3/§9 — the market can be good while the (selected/top) product is not.
  const gapNote = productVsMarketNote(
    twin.marketOpportunity ?? snap.finalScore,
    topProduct?.score ?? null,
    DEFAULT_THRESHOLDS.monitor,
    isProduct,
  );
  // §11 decision confidence (separate from data confidence) + §7 model-aware next steps.
  const decisionConf = decisionConfidence(criteria, snap.measuredCriteria, snap.confidence, model);
  const decisionBand: Decision =
    decisionConf.band === "high" ? "WORTH_RESEARCHING" : decisionConf.band === "medium" ? "MONITOR" : "NOT_PRIORITY";
  const actions = decisionActions(model, decision, snap.countryLabel, topProduct?.productGroup ?? null);

  const providersUsed = Array.from(new Set(citations.map((c) => c.provider)));
  const fetchedAt = citations[0]?.fetchedAt ?? snap.createdAt;

  // Curated verified figures (🟢) pulled from the frozen criterion raw inputs.
  const demandC = criteria.find((c) => c.key === "demand");
  const supplyC = criteria.find((c) => c.key === "supplyAdvantage");
  const entryC = criteria.find((c) => c.key === "entry");
  const compC = criteria.find((c) => c.key === "competition");
  const verifiedFigures: Array<{ label: string; value: string }> = [];
  const ti = demandC?.rawInputs.targetImport;
  if (typeof ti === "number") verifiedFigures.push({ label: `${snap.countryLabel} ithalatı`, value: fmtUsd(ti) });
  const tx = supplyC?.rawInputs.trToTargetExport;
  if (typeof tx === "number") verifiedFigures.push({ label: `Türkiye → ${snap.countryLabel}`, value: fmtUsd(tx) });
  const share = supplyC?.rawInputs.trSharePct;
  if (typeof share === "number") verifiedFigures.push({ label: "Türkiye'nin pazar payı", value: `%${share.toFixed(1).replace(".", ",")}` });
  const duty = entryC?.rawInputs.customsDutyPct;
  if (supplyC?.rawInputs.euDutyFree === true) verifiedFigures.push({ label: "Gümrük vergisi (TR menşeli)", value: "%0 (Gümrük Birliği)" });
  else if (typeof duty === "number") verifiedFigures.push({ label: "Gümrük vergisi", value: `%${duty}` });
  if (conc) verifiedFigures.push({ label: "Tedarik yoğunlaşması", value: `${conc.bandLabel}${conc.sources != null ? ` · ${conc.sources} kaynak ülke` : ""}` });

  // Honest pipeline outcome — derived from the ACTUAL result, not animated.
  const steps: Array<{ label: string; ok: boolean }> = [
    { label: "HS kodları belirlendi", ok: Array.isArray(snap.resolvedHs) && (snap.resolvedHs as unknown[]).length > 0 },
    { label: "İthalat / pazar büyüklüğü verisi", ok: !!demandC?.available },
    { label: "Büyüme trendi verisi", ok: !!criteria.find((c) => c.key === "growth")?.available },
    { label: "Türkiye ihracatı verisi", ok: !!supplyC?.available },
    { label: "Giriş zorluğu hesaplandı", ok: !!entryC?.available },
    { label: "Rekabet yapısı verisi", ok: !!compC?.available },
    { label: "Fırsat skoru oluşturuldu", ok: !insufficient },
    { label: "Kaynaklar doğrulandı", ok: citations.length > 0 },
    { label: "Analiz kaydedildi", ok: true },
  ];

  // §6/§14 "Ticari Yorum" — reused in both the sufficient and insufficient flows,
  // so it is defined once and placed at the right point in the hierarchy.
  const meaningNode = (
    <section className="mt-6 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-h6 font-semibold text-foreground">Ticari Yorum</h2>
      <p className="mt-1 text-caption text-subtle">Bu puan AYZENITH için ne anlama geliyor?</p>
      <p className="mt-2 text-body text-foreground/90">{meaning}</p>
      {ai.ozet ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f8f1dc] px-3 py-1 text-caption font-medium text-[#8a6d1f]">
          <Sparkles className="size-3.5" aria-hidden="true" /> 🟡 AI yorumu — kaynaklı veriye dayanır, rakam üretmez
        </p>
      ) : snap.aiSummary === null ? (
        <p className="mt-3 text-caption text-subtle">
          (AI yorum katmanı kapalı olduğu için bu açıklama sistem tarafından şablonla üretildi.)
        </p>
      ) : null}
      {model === "B2C" ? (
        <p className="mt-3 rounded-lg bg-surface-sunken px-4 py-3 text-caption text-subtle">
          <span className="font-medium text-foreground">B2C sınırı:</span> Bu B2C analizi ithalat ve
          ticaret verileri üzerinden oluşturulmuştur. Tüketici geliri, e-ticaret penetrasyonu, nüfus ve
          satın alma davranışı doğrudan ölçülmediğinden tüketici talebi hakkında kesin sonuç çıkarılamaz.
          (Ölçülmeyenler: {B2C_UNMEASURED_SIGNALS.join(", ")}.)
        </p>
      ) : null}
    </section>
  );

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Link href="/admin/radar" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> RADAR
        </Link>
        <Link
          href={`/admin/radar/history?category=${snap.categoryKey}&country=${snap.countryCode}`}
          className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground"
        >
          <History className="size-3.5" aria-hidden="true" /> Geçmiş & Karşılaştır
        </Link>
      </div>

      <PageHeader
        title={`${flagEmoji(snap.countryCode)} ${snap.countryLabel}`}
        description={contextLine}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-sunken px-3 text-caption font-semibold text-muted">
              {isProduct ? "Ürün Analizi" : "Kategori Analizi"} · {MODEL_LABELS[model] ?? model}
            </span>
            <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#bcd8c4] bg-[#eaf3ec] px-4 text-small font-medium text-[#2f7a48]">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Geçmişe kaydedildi
            </span>
            {!insufficient ? (
              <WatchButton categoryKey={snap.categoryKey} countryCode={snap.countryCode} alreadyWatched={alreadyWatched} />
            ) : null}
            {/* §2 — carry this analysis into Lead Finder (country/product/model +
                the RADAR context, preserved on every lead found from here). */}
            <Link
              href={`/admin/lead-finder/new?${new URLSearchParams({
                country: snap.countryCode,
                product: isProduct ? (snap.productName ?? categoryLabel(snap.categoryKey)) : categoryLabel(snap.categoryKey),
                model,
                snapshot: snap.id,
                category: snap.categoryKey,
                ...(snap.hsCode ? { hs6: snap.hsCode } : {}),
                ...(snap.finalScore != null ? { score: String(snap.finalScore) } : {}),
                decision: band.label,
              }).toString()}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Crosshair className="size-4" aria-hidden="true" /> Lead Finder ile Ara
            </Link>
          </div>
        }
      />

      {/* 1. GENEL SONUÇ — HERO score + band + confidence */}
      <section
        className="rounded-2xl border p-8 text-center"
        style={{ backgroundColor: band.bg, borderColor: band.border }}
      >
        {insufficient ? (
          <>
            <p className="text-h1 font-bold" style={{ color: band.fg }}>⚠</p>
            <p className="mt-2 text-h5 font-semibold" style={{ color: band.fg }}>VERİ YETERSİZ</p>
            <p className="mx-auto mt-3 max-w-xl text-small text-muted">
              Bu analiz güvenilir bir skor üretmek için yeterli veriye sahip değil. Sistem
              tahmin yürütmek yerine “bilmiyorum” diyor. Ölçülebilen kriter: {snap.measuredCriteria}/5.
            </p>
          </>
        ) : (
          <>
            <p className="font-serif text-[4rem] font-bold leading-none tabular-nums" style={{ color: band.fg }}>
              {snap.finalScore}<span className="text-h3 font-semibold text-muted"> / 100</span>
            </p>
            <div className="mt-4 flex justify-center">
              <ScoreBadge decision={decision} score={null} size="lg" />
            </div>
            <div className="mt-5 flex flex-col items-center gap-1">
              <p className="text-h5 tracking-[0.2em]" style={{ color: band.fg }} aria-hidden="true">
                {confidenceDots(snap.measuredCriteria)}
              </p>
              <p className="text-small font-medium text-muted">
                Veri güveni: %{snap.confidence} · {snap.measuredCriteria} / 5 kriter ölçüldü
              </p>
            </div>
          </>
        )}
      </section>

      {!insufficient ? (
        <>
          {/* 2 + 3. MARKET OPPORTUNITY + AYZENITH FIT */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <TwinCard
              icon={<TrendingUp className="size-4" aria-hidden="true" />}
              title="MARKET OPPORTUNITY"
              score={twin.marketOpportunity}
              subtitle="Pazarın genel ticari çekiciliği: ithalat hacmi, büyüme ve rekabet yapısı."
            />
            <TwinCard
              icon={<Target className="size-4" aria-hidden="true" />}
              title="AYZENITH FIT"
              score={twin.ayzenithFit}
              subtitle="AYZENITH için uygunluk: Türkiye tedarik avantajı ve pazara giriş kolaylığı."
            />
          </div>

          {/* 4. KARAR GÜVENİ — data confidence vs decision confidence (§11) */}
          <section className="mt-6 rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" style={{ color: BAND[decisionBand].fg }} aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">Karar Güveni</h2>
            </div>
            <p className="mt-1 text-caption text-subtle">
              <span className="font-medium text-foreground">Veri Güveni</span> verinin ne kadarının ölçüldüğünü;{" "}
              <span className="font-medium text-foreground">Karar Güveni</span> bu verinin ticari karar vermeye ne kadar yettiğini gösterir.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
                <p className="text-caption text-subtle">Veri Güveni</p>
                <p className="text-h5 font-bold tabular-nums text-foreground">%{snap.confidence}</p>
                <p className="text-caption text-subtle">{snap.measuredCriteria}/5 kriter ölçüldü</p>
              </div>
              <div className="rounded-lg border px-4 py-3" style={{ borderColor: BAND[decisionBand].border, backgroundColor: BAND[decisionBand].bg }}>
                <p className="text-caption" style={{ color: BAND[decisionBand].fg }}>Karar Güveni</p>
                <p className="text-h5 font-bold tabular-nums" style={{ color: BAND[decisionBand].fg }}>
                  %{decisionConf.pct} <span className="text-small font-semibold">· {decisionConf.label}</span>
                </p>
                <p className="text-caption text-subtle">{decisionConf.reasons.join(" · ")}</p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {insufficient ? meaningNode : null}

      {!insufficient ? (
        <>
          {/* 5. AYZENITH KARARI */}
          <section className="mt-6 rounded-xl border-2 p-6" style={{ borderColor: band.border, backgroundColor: band.bg }}>
            <div className="flex items-center gap-2">
              <Zap className="size-4" style={{ color: band.fg }} aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">AYZENITH Kararı</h2>
            </div>
            <p className="mt-2 text-h4 font-semibold" style={{ color: band.fg }}>{band.dot} {band.label}</p>
            {topProduct ? (
              <p className="mt-2 text-small text-foreground/90">
                <span className="font-semibold">
                  {isProduct ? "Ürün fırsat skoru: " : "Önerilen ürün: "}
                </span>
                {isProduct ? `${topProduct.score}/100` : topProduct.productGroup}
                {!isProduct ? <span className="text-subtle"> (fırsat skoru {topProduct.score}/100)</span> : null}
              </p>
            ) : null}
            {gapNote ? (
              <div className="mt-3 rounded-lg bg-surface-sunken px-4 py-3">
                <p className="text-caption font-semibold text-foreground">Karar özeti</p>
                <p className="mt-0.5 text-caption text-foreground/80">{gapNote}</p>
              </div>
            ) : null}
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-caption font-semibold text-muted">
              {MODEL_LABELS[model] ?? model} perspektifi
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-caption font-semibold text-foreground">İlk ticari aksiyon</p>
                <p className="mt-0.5 text-caption text-foreground/80">{actions.first}</p>
              </div>
              <div>
                <p className="text-caption font-semibold text-foreground">İkinci aksiyon</p>
                <p className="mt-0.5 text-caption text-foreground/80">{actions.second}</p>
              </div>
            </div>
            <p className="mt-3 text-caption text-subtle">{actions.note}</p>
          </section>

          {/* 6. TİCARİ YORUM */}
          {meaningNode}

          {/* 7. ÜRÜN FIRSATLARI — prioritize / deprioritize (category scope only;
                a product analysis IS a single product, so no inner ranking). */}
          {!isProduct && subs.length > 0 ? (
            <section className="mt-6 rounded-xl border border-border bg-surface p-6">
              <h2 className="text-h6 font-semibold text-foreground">AYZENITH Ürün Fırsatları</h2>
              <p className="mt-1 text-caption text-subtle">
                Gerçek HS-6 ürün verisinden hesaplanan bileşik fırsat skoruna göre sıralanır
                (yalnızca pazar büyüklüğüne göre değil).
              </p>

              {products.prioritize.length > 0 ? (
                <ul className="mt-4 divide-y divide-border">
                  {products.prioritize.map(({ sub: s, reason }) => (
                    <li key={s.hs6} className="flex items-center gap-3 py-3">
                      <ScoreChip decision={s.score >= 80 ? "WORTH_RESEARCHING" : "MONITOR"} score={s.score} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-small font-medium text-foreground">{s.productGroup}</p>
                        <p className="text-caption text-subtle">HS {s.hs6} · {reason}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eaf3ec] px-2.5 py-1 text-caption font-semibold text-[#2f7a48]">
                        Önceliklendir
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-small text-subtle">Öne çıkan (önceliklendirilecek) ürün bulunamadı.</p>
              )}

              {products.deprioritize.length > 0 ? (
                <details className="group mt-4">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-small font-medium text-muted hover:text-foreground">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    Önceliklendirilmeyen ürünler ({products.deprioritize.length})
                  </summary>
                  <ul className="mt-3 divide-y divide-border">
                    {products.deprioritize.map(({ sub: s, reason }) => (
                      <li key={s.hs6} className="flex items-center gap-3 py-3 opacity-80">
                        <ScoreChip decision="NOT_PRIORITY" score={s.score} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-small font-medium text-foreground">{s.productGroup}</p>
                          <p className="text-caption text-subtle">HS {s.hs6} · {reason}</p>
                        </div>
                        <span className="shrink-0 text-caption text-subtle">Şimdilik öncelik değil</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          ) : null}

          {/* 6. SKOR KIRILIMI */}
          <section className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h2 className="text-h6 font-semibold text-foreground">Skor Kırılımı</h2>
            <p className="mt-1 text-caption text-subtle">
              Her kriterin üstüne tıklayarak nasıl hesaplandığını, hangi veriden geldiğini görebilirsiniz.
            </p>
            <div className="mt-5 space-y-3">
              {criteria.map((c) => {
                const label = CRITERION_LABELS[c.key as RadarCriterionKey] ?? c.key;
                const weight = weights[c.key] ?? 0;
                const pct = c.score ?? 0;
                // Which sourced figures actually back THIS criterion (§ audit
                // finding — citations used to sit only in one flat undifferentiated
                // list, so a reader had to guess which source supported which score).
                const ownCitations = citations.filter(
                  (cit) => Array.isArray(cit.criterionKeys) && (cit.criterionKeys as string[]).includes(c.key),
                );
                return (
                  <details key={c.key} className="group rounded-lg border border-border bg-surface-sunken">
                    <summary className="flex cursor-pointer list-none items-center gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-small font-medium text-foreground">{label}</span>
                          <span className="shrink-0 text-caption text-subtle">Ağırlık %{weight}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                            {c.available ? (
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BAND.WORTH_RESEARCHING.fg }} />
                            ) : null}
                          </div>
                          <span className="w-14 shrink-0 text-right text-small font-bold tabular-nums text-foreground">
                            {c.available && c.score != null ? c.score : "veri yok"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <div className="border-t border-border px-4 py-4">
                      <p className="text-small text-foreground/90">{c.explanation}</p>
                      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        {Object.entries(c.rawInputs).map(([k, v]) => {
                          if (v == null || k === "topSources") return null;
                          let display: string = String(v);
                          if (k === "targetImport" || k === "trToTargetExport") display = typeof v === "number" ? fmtUsd(v) : display;
                          else if (k === "cagrPct" || k === "trSharePct") display = typeof v === "number" ? `%${String(v).replace(".", ",")}` : display;
                          else if (k === "certificationBurden") display = BURDEN_LABELS[String(v)] ?? display;
                          else if (typeof v === "boolean") display = v ? "Evet" : "Hayır";
                          return (
                            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-1">
                              <dt className="text-caption text-subtle">{RAW_INPUT_LABELS[k] ?? k}</dt>
                              <dd className="text-caption font-medium text-foreground">{display}</dd>
                            </div>
                          );
                        })}
                      </dl>
                      {ownCitations.length > 0 ? (
                        <div className="mt-3 border-t border-dashed border-border/70 pt-3">
                          <p className="text-caption font-medium text-subtle">Bu kriteri destekleyen kaynaklar</p>
                          <ul className="mt-1.5 space-y-1">
                            {ownCitations.map((cit, i) => (
                              <li key={i} className="flex items-center gap-2 text-caption text-foreground/90">
                                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                                  {PROVIDER_LABELS[cit.provider] ?? cit.provider}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{cit.label}</span>
                                {cit.sourceUrl ? (
                                  <a href={cit.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-subtle hover:text-foreground">
                                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                                  </a>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="mt-3 text-caption text-subtle">
                          Kaynak: {providersUsed.map((p) => PROVIDER_LABELS[p] ?? p).join(", ") || "—"} · Veri çekilme: {fmtDate(fetchedAt)}
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          {/* 7. DOĞRULANMIŞ VERİ */}
          <section className="mt-6 rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" style={{ color: BAND.WORTH_RESEARCHING.fg }} aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">Doğrulanmış Veri</h2>
            </div>
            <p className="mt-1 text-caption text-subtle">Her rakam resmi bir kaynağa dayanır ve tıklanarak denetlenebilir.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {verifiedFigures.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 rounded-lg border border-[#bcd8c4] bg-[#eaf3ec] px-4 py-3">
                  <div>
                    <p className="text-caption font-medium text-[#2f7a48]">🟢 {f.label}</p>
                    <p className="text-body font-semibold text-foreground">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Top supplier countries */}
            {conc && conc.top.length > 0 ? (
              <div className="mt-4">
                <p className="text-caption font-medium text-foreground">
                  En büyük tedarikçi ülkeler · {conc.bandLabel}
                  {conc.hhi != null ? ` (yoğunlaşma endeksi ${conc.hhi.toFixed(2).replace(".", ",")})` : ""}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {conc.top.slice(0, 8).map((s) => (
                    <li key={s.cc} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-caption text-foreground">{countryName(s.cc)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(s.sharePct, 100)}%`, backgroundColor: BAND.MONITOR.fg }} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-caption font-medium tabular-nums text-foreground">%{s.sharePct.toFixed(1).replace(".", ",")}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-caption text-subtle">
                  “Çok sayıda kaynak ülke” ile “pazarın gerçekten dağınık olması” aynı şey değildir;
                  yukarıdaki yoğunlaşma endeksi bunu ölçer.
                </p>
              </div>
            ) : null}

            {/* Source list */}
            <details className="group mt-4">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-small font-medium text-muted hover:text-foreground">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                Tüm kaynakları göster ({citations.length})
              </summary>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {citations.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                      {PROVIDER_LABELS[c.provider] ?? c.provider}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption text-foreground">{c.label}</span>
                    <span className="shrink-0 text-caption text-subtle">{c.rawValue}{c.unit ? ` ${c.unit}` : ""}</span>
                    {c.sourceUrl ? (
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-subtle hover:text-foreground">
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {/* 8 + 9. FIRSATLAR / RİSKLER */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <Lightbulb className="size-4" style={{ color: BAND.WORTH_RESEARCHING.fg }} aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Fırsatlar</h2>
              </div>
              {opportunities.length === 0 ? (
                <p className="mt-3 text-small text-subtle">Öne çıkan bir fırsat sinyali bulunamadı.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {opportunities.map((o, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-small text-foreground/90">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: BAND.WORTH_RESEARCHING.fg }} aria-hidden="true" />
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4" style={{ color: BAND.NOT_PRIORITY.fg }} aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Riskler</h2>
              </div>
              {risks.length === 0 ? (
                <p className="mt-3 text-small text-subtle">Belirgin bir risk sinyali bulunamadı.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-small text-foreground/90">
                      <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: BAND.NOT_PRIORITY.fg }} aria-hidden="true" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* 10a. ÇELİŞKİLİ SİNYALLER — criteria that point opposite ways */}
          {conflicts.length > 0 ? (
            <section className="mt-6 rounded-xl border border-[#e5d4a0] bg-[#f8f1dc] p-6">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="size-4" style={{ color: BAND.MONITOR.fg }} aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Çelişkili Sinyaller</h2>
              </div>
              <p className="mt-1 text-caption text-subtle">
                Kriterler birbiriyle çeliştiğinde skor tek başına yorumlanmamalı. Bunlar gerçek veriden türetildi.
              </p>
              <ul className="mt-3 space-y-2.5">
                {conflicts.map((c, i) => (
                  <li key={`c${i}`} className="flex items-start gap-2.5 text-small text-foreground/90">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">⚠</span>{c}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 10b. VERİ SINIRLAMALARI — what could NOT be measured (never a risk) */}
          {dataLimitations.length > 0 || anomalies.length > 0 || providerWarnings.length > 0 ? (
            <section className="mt-6 rounded-xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-subtle" aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Veri Sınırlamaları</h2>
              </div>
              <p className="mt-1 text-caption text-subtle">
                Bunlar ticari risk değildir — ölçülemeyen veya doğrulanamayan verilerdir. Eksik veri,
                otomatik olarak olumsuz bir sonuç anlamına gelmez.
              </p>
              <ul className="mt-3 space-y-2.5">
                {dataLimitations.map((d, i) => (
                  <li key={`d${i}`} className="flex items-start gap-2.5 text-small text-foreground/80">
                    <Info className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />{d}
                  </li>
                ))}
                {anomalies.map((a, i) => (
                  <li key={`a${i}`} className="flex items-start gap-2.5 text-small text-foreground/80">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">⚠</span>{a}
                  </li>
                ))}
                {providerWarnings.map((w, i) => (
                  <li key={`w${i}`} className="flex items-start gap-2.5 text-small text-foreground/80">
                    <Info className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />{w}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h6 font-semibold text-foreground">Neden skor üretilmedi?</h2>
          <ul className="mt-3 space-y-2">
            {criteria.filter((c) => !c.available).map((c) => (
              <li key={c.key} className="flex items-start gap-2.5 text-small text-muted">
                <XCircle className="mt-0.5 size-4 shrink-0 text-[#8a2b2b]" aria-hidden="true" />
                <span><b className="text-foreground">{CRITERION_LABELS[c.key as RadarCriterionKey] ?? c.key}:</b> {c.explanation}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/radar/new" className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white hover:opacity-90">
            Yeni analiz dene
          </Link>
        </section>
      )}

      {/* 11 + 12. Analiz adımları (kaynaklar yukarıda) — honest, real outcome */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-h6 font-semibold text-foreground">Analiz Adımları</h2>
        <p className="mt-1 text-caption text-subtle">Bu analizde her adımın gerçek sonucu (✓ başarılı · ⚠ veri alınamadı).</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-small">
              {s.ok ? (
                <CheckCircle2 className="size-4 shrink-0" style={{ color: BAND.WORTH_RESEARCHING.fg }} aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" style={{ color: BAND.MONITOR.fg }} aria-hidden="true" />
              )}
              <span className={s.ok ? "text-foreground/90" : "text-muted"}>
                {s.ok ? s.label : `${s.label} — ⚠ veri alınamadı`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-caption text-subtle">Analiz zamanı: {fmtDate(snap.createdAt)}</p>
      </section>
    </>
  );
}
