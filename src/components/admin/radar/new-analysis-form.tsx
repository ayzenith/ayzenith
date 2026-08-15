"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, ChevronDown, Loader2, Play, Globe, MapPin, Building2, ShoppingCart,
  Search, Package, LayoutGrid, CheckCircle2, Info,
} from "lucide-react";
import {
  startAnalysisAction, matchProductAction,
  type StartState, type MatchState,
} from "@/app/(admin)/admin/(dashboard)/radar/actions";
import { BrandLoader } from "@/components/ui/brand-loader";
import { BUSINESS_MODELS, type BusinessModel } from "@/config/radar";
import type { HsMatch } from "@/server/radar/hs";
import { cn } from "@/lib/utils";

type Category = { key: string; label: string; verified: number };
type Country = { code: string; label: string };
type Region = { key: string; label: string; count: number };
type AnalysisType = "category" | "product";

const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-border bg-surface px-3.5 pr-10 text-body text-foreground outline-none transition-colors focus:border-accent";

/** The stages the pipeline really runs, in order. Shown during a run as an
 *  honest "what the system is doing now" list — NOT a fake progress bar. The
 *  true per-stage outcome (✓ / ⚠) is shown afterwards on the result screen. */
const STAGES = [
  "HS kodları belirleniyor",
  "Resmi ticaret verileri çekiliyor",
  "Türkiye ihracatı analiz ediliyor",
  "Pazar büyüklüğü hesaplanıyor",
  "Büyüme trendi hesaplanıyor",
  "Rekabet yapısı analiz ediliyor",
  "Giriş zorluğu hesaplanıyor",
  "Fırsat skoru oluşturuluyor",
  "Kaynaklar doğrulanıyor",
  "Analiz kaydediliyor",
];

function Running() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <div className="flex items-center gap-3">
        <BrandLoader size="lg" label="Analiz hazırlanıyor" />
        <div>
          <h2 className="text-h6 font-semibold text-foreground">Analiz çalışıyor…</h2>
          <p className="text-caption text-subtle">
            Resmi ticaret veritabanlarından canlı veri çekiliyor. Bu 20–60 saniye sürebilir.
          </p>
        </div>
      </div>
      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {STAGES.map((s) => (
          <li key={s} className="flex items-center gap-2.5 text-small text-muted">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {s}
          </li>
        ))}
      </ul>
      <p className="mt-6 rounded-lg bg-surface-sunken px-4 py-3 text-caption text-subtle">
        Sistem gerçek veriyle çalışıyor. Bir adımda veri alınamazsa sonuç ekranında
        açıkça <span className="font-medium text-foreground">⚠ veri alınamadı</span> olarak gösterilir —
        asla uydurma veri kullanılmaz.
      </p>
    </div>
  );
}

export function NewAnalysisForm({
  categories,
  countries,
  regions,
}: {
  categories: Category[];
  countries: Country[];
  regions: Region[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<StartState, FormData>(
    startAnalysisAction,
    {},
  );
  const [matchState, matchAction, matching] = useActionState<MatchState, FormData>(
    matchProductAction,
    {},
  );

  const [analysisType, setAnalysisType] = useState<AnalysisType>("category");
  const [scope, setScope] = useState<"country" | "region">("country");
  const [model, setModel] = useState<BusinessModel>("B2B");
  const [advanced, setAdvanced] = useState(false);
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key ?? "");
  const [countryCode, setCountryCode] = useState("DE");
  const [selected, setSelected] = useState<HsMatch | null>(null);

  useEffect(() => {
    if (state.snapshotId) router.replace(`/admin/radar/analysis/${state.snapshotId}`);
    else if (state.regionUrl) router.replace(state.regionUrl);
  }, [state.snapshotId, state.regionUrl, router]);

  // A new match search invalidates any previously selected candidate.
  useEffect(() => { setSelected(null); }, [matchState]);

  // Keep showing the running screen through the redirect that follows success.
  if (pending || state.snapshotId || state.regionUrl) return <Running />;

  const activeCategory = categories.find((c) => c.key === categoryKey);
  const noVerified = activeCategory ? activeCategory.verified === 0 : false;
  const labelByKey = Object.fromEntries(categories.map((c) => [c.key, c.label]));
  const countryLabel = countries.find((c) => c.code === countryCode)?.label ?? countryCode;

  return (
    <div className="flex flex-col gap-6">
      {state.error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="font-serif text-h4 font-semibold text-foreground">
          Ne araştırmak istiyorsunuz?
        </h2>
        <p className="mt-1.5 text-small text-muted">
          Bir kategoriyi ya da tek bir ürünü, bir pazarda RADAR ile analiz edin. Fırsat
          seviyesi resmi ticaret verilerinden hesaplanır.
        </p>

        {/* Analysis type: category vs specific product */}
        <div className="mt-6 flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">Analiz Türü</span>
          <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-1">
            <button
              type="button"
              onClick={() => setAnalysisType("category")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                analysisType === "category" ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" /> Kategori
            </button>
            <button
              type="button"
              onClick={() => { setAnalysisType("product"); setScope("country"); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                analysisType === "product" ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
              )}
            >
              <Package className="size-3.5" aria-hidden="true" /> Spesifik Ürün
            </button>
          </div>
          <span className="text-caption text-subtle">
            {analysisType === "category"
              ? "Kategorinin tüm doğrulanmış HS kodları analiz edilir."
              : "Tek bir ürün (ör. “kablosuz kulaklık”) doğrulanmış HS-6 koduna eşlenip analiz edilir."}
          </span>
        </div>

        {/* Shared: target market + business model */}
        <div className="mt-5 grid gap-5">
          {/* Business model */}
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Ticari Model</span>
            <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-1">
              {BUSINESS_MODELS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setModel(m.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                    model === m.key ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  {m.key === "B2B" ? <Building2 className="size-3.5" aria-hidden="true" /> : <ShoppingCart className="size-3.5" aria-hidden="true" />}
                  {m.label}
                </button>
              ))}
            </div>
            <span className="text-caption text-subtle">
              {BUSINESS_MODELS.find((m) => m.key === model)?.hint}
            </span>
          </div>

          {/* Target market (country) — always needed. Region only for category scope. */}
          {analysisType === "product" || scope === "country" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Hedef Pazar</span>
              <div className="relative">
                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={selectCls}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              </div>
            </label>
          ) : null}
        </div>

        {/* ===== CATEGORY FLOW ===== */}
        {analysisType === "category" ? (
          <form action={formAction} className="mt-5 grid gap-5">
            <input type="hidden" name="analysisType" value="category" />
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="tradeModel" value={model} />
            <input type="hidden" name="supplyMarket" value="TR" />
            {scope === "country" ? <input type="hidden" name="countryCode" value={countryCode} /> : null}

            {/* Category */}
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Kategori</span>
              <div className="relative">
                <select
                  name="categoryKey"
                  value={categoryKey}
                  onChange={(e) => setCategoryKey(e.target.value)}
                  className={selectCls}
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                      {c.verified === 0 ? " — doğrulanmış HS kodu yok" : ` (${c.verified} HS kodu)`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              </div>
              {noVerified ? (
                <span className="text-caption text-[#8a2b2b]">
                  Bu kategoride doğrulanmış HS kodu yok — analiz yapılamaz. HS Eşlemeleri
                  bölümünden kod ekleyip doğrulayın.
                </span>
              ) : null}
            </label>

            {/* Scope toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Kapsam</span>
              <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-1">
                <button
                  type="button"
                  onClick={() => setScope("country")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                    scope === "country" ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  <MapPin className="size-3.5" aria-hidden="true" /> Tek ülke
                </button>
                <button
                  type="button"
                  onClick={() => setScope("region")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                    scope === "region" ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  <Globe className="size-3.5" aria-hidden="true" /> Bölge
                </button>
              </div>
            </div>

            {scope === "region" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Bölge</span>
                <div className="relative">
                  <select name="region" defaultValue={regions[0]?.key} className={selectCls}>
                    {regions.map((r) => (
                      <option key={r.key} value={r.key}>{r.label} ({r.count} ülke)</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                </div>
                <span className="text-caption text-subtle">
                  Bölge seçilince her ülke ayrı ayrı analiz edilip en yüksek fırsattan sıralanır.
                  Canlı veri çekildiği için biraz uzun sürebilir.
                </span>
              </label>
            ) : null}

            {/* Advanced */}
            <div>
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-small font-medium text-muted hover:text-foreground"
              >
                <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} aria-hidden="true" />
                Gelişmiş ayarlar
              </button>
              {advanced ? (
                <div className="mt-3 grid gap-4 rounded-lg border border-border bg-surface-sunken p-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Tedarik Pazarı</span>
                    <div className="relative">
                      <select disabled defaultValue="TR" className={cn(selectCls, "opacity-70")}>
                        <option value="TR">Türkiye</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                    </div>
                    <span className="text-caption text-subtle">V1'de tedarik pazarı Türkiye'dir.</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="submit"
                disabled={noVerified}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-navy-950 px-7 text-body font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Play className="size-4" aria-hidden="true" /> Analizi Başlat
              </button>
            </div>
          </form>
        ) : (
          /* ===== PRODUCT FLOW ===== */
          <div className="mt-5 flex flex-col gap-5">
            {/* Step 1 — product name → HS candidates */}
            <form action={matchAction} className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Ürün adı</span>
              <div className="flex gap-2">
                <input
                  name="productQuery"
                  defaultValue={matchState.query ?? ""}
                  placeholder="ör. kablosuz kulaklık, akıllı saat, dental implant"
                  className="h-11 flex-1 rounded-lg border border-border bg-surface px-3.5 text-body text-foreground outline-none transition-colors focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={matching}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-small font-semibold text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
                >
                  {matching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                  HS Bul
                </button>
              </div>
              <span className="text-caption text-subtle">
                Sistem önce AYZENITH'in <span className="font-medium text-foreground">doğrulanmış</span> HS
                tablosunda arar. Doğrudan HS-6 kodu da yazabilirsiniz.
              </span>
            </form>

            {matchState.error ? (
              <p className="flex items-start gap-2 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{matchState.error}
              </p>
            ) : null}

            {/* Verified candidates → pick one */}
            {matchState.matches && matchState.matches.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-small font-medium text-foreground">
                  Doğrulanmış eşleşmeler — birini seçin
                </span>
                <ul className="grid gap-2">
                  {matchState.matches.map((m) => {
                    const active = selected?.hs6 === m.hs6 && selected?.categoryKey === m.categoryKey;
                    return (
                      <li key={`${m.categoryKey}:${m.hs6}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(m)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                            active ? "border-accent bg-surface-sunken" : "border-border bg-surface hover:border-accent/50",
                          )}
                        >
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-accent bg-accent text-white" : "border-border")}>
                            {active ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-small font-medium text-foreground">{m.productGroup}</p>
                            <p className="text-caption text-subtle">HS {m.hs6} · {labelByKey[m.categoryKey] ?? m.categoryKey}</p>
                          </div>
                          <span className="shrink-0 rounded bg-[#eaf3ec] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2f7a48]">Doğrulanmış</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* No verified match → advisory AI suggestions (NOT analysable yet) */}
            {matchState.matches && matchState.matches.length === 0 ? (
              <div className="rounded-lg border border-[#e5d4a0] bg-[#f8f1dc] p-4">
                <p className="flex items-start gap-2 text-small text-[#8a6d1f]">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{matchState.aiNote}</span>
                </p>
                {matchState.suggestions && matchState.suggestions.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
                    {matchState.suggestions.map((s) => (
                      <li key={s.hs6} className="rounded-md border border-[#e5d4a0] bg-surface px-3 py-2">
                        <p className="text-small font-medium text-foreground">HS {s.hs6} · {s.label}</p>
                        <p className="text-caption text-subtle">{s.reason}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-caption text-[#8a6d1f]">
                  🟡 AI önerisi doğrulanmadan analize giremez.{" "}
                  <Link href="/admin/radar/hs" className="font-semibold underline">HS Eşlemeleri</Link>'nde
                  ekleyip doğruladıktan sonra tekrar aratın.
                </p>
              </div>
            ) : null}

            {/* Step 2 — confirmed product → run */}
            {selected ? (
              <form action={formAction} className="rounded-xl border border-accent/40 bg-surface-sunken p-4">
                <input type="hidden" name="analysisType" value="product" />
                <input type="hidden" name="scope" value="country" />
                <input type="hidden" name="tradeModel" value={model} />
                <input type="hidden" name="supplyMarket" value="TR" />
                <input type="hidden" name="countryCode" value={countryCode} />
                <input type="hidden" name="categoryKey" value={selected.categoryKey} />
                <input type="hidden" name="hsCode" value={selected.hs6} />
                <input type="hidden" name="productName" value={selected.productGroup} />
                <p className="text-caption text-subtle">Analiz edilecek:</p>
                <p className="mt-0.5 text-small font-semibold text-foreground">
                  {countryLabel} · {selected.productGroup} · HS {selected.hs6} · {model}
                </p>
                <button
                  type="submit"
                  className="mt-3 inline-flex h-12 items-center gap-2 rounded-xl bg-navy-950 px-7 text-body font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Play className="size-4" aria-hidden="true" /> Bu ürünü analiz et
                </button>
              </form>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
