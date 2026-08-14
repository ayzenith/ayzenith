"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Building2, ChevronDown, Loader2, MapPin, Play, Search,
  ShoppingCart, Radar as RadarIcon,
} from "lucide-react";
import {
  startSearchAction, type StartSearchState,
} from "@/app/(admin)/admin/(dashboard)/lead-finder/actions";
import { LEAD_ROLES } from "@/config/leads";
import { cn } from "@/lib/utils";

/**
 * Lead Finder search form. Same visual language as RADAR's new-analysis form
 * (segmented toggles, navy submit, honest "running" state). Supports optional
 * prefill from a RADAR analysis (§2) — country/product/model/HS carried in.
 */

type Country = { code: string; label: string };
type Model = "B2B" | "B2C";

const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-border bg-surface px-3.5 pr-10 text-body text-foreground outline-none transition-colors focus:border-accent";
const inputCls =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-body text-foreground outline-none transition-colors focus:border-accent";

export type SearchPrefill = {
  countryCode?: string;
  productQuery?: string;
  businessModel?: Model;
  radarSnapshotId?: string;
  categoryKey?: string;
  hs6?: string;
  radarScore?: string;
  radarDecision?: string;
};

const STAGES = [
  "Arama stratejisi oluşturuluyor",
  "Ücretsiz kaynaklardan adaylar keşfediliyor (OpenStreetMap)",
  "Tekrar eden kayıtlar temizleniyor",
  "Ticari roller sınıflandırılıyor",
  "İşletme ölçeği belirleniyor",
  "Lead skoru ve güven hesaplanıyor",
  "Sonuçlar kaydediliyor",
];

function Running() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-accent" aria-hidden="true" />
        <div>
          <h2 className="text-h6 font-semibold text-foreground">Aday firmalar aranıyor…</h2>
          <p className="text-caption text-subtle">
            Ücretsiz ve kamuya açık kaynaklardan canlı veri çekiliyor. Bu 15–60 saniye sürebilir.
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
        Sistem yalnızca gerçek, kaynaklı verilerle çalışır. Bir kaynağa ulaşılamazsa sonuç
        ekranında açıkça <span className="font-medium text-foreground">⚠ veri alınamadı</span> yazar —
        asla uydurma firma veya iletişim bilgisi üretilmez.
      </p>
    </div>
  );
}

export function SearchForm({
  countries,
  prefill,
}: {
  countries: Country[];
  prefill?: SearchPrefill;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<StartSearchState, FormData>(
    startSearchAction,
    {},
  );

  const [model, setModel] = useState<Model>(prefill?.businessModel ?? "B2B");
  const [countryCode, setCountryCode] = useState(prefill?.countryCode ?? "DE");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]); // [] = all

  useEffect(() => {
    if (state.searchId) router.replace(`/admin/lead-finder/${state.searchId}`);
  }, [state.searchId, router]);

  if (pending || state.searchId) return <Running />;

  function toggleRole(key: string) {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key],
    );
  }

  const fromRadar = Boolean(prefill?.radarSnapshotId);

  return (
    <div className="flex flex-col gap-6">
      {state.error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {fromRadar ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#bcd8c4] bg-[#eaf3ec] px-4 py-3 text-small text-[#2f7a48]">
          <RadarIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Bu arama bir RADAR analizinden başlatıldı. Ülke, ürün ve ticari model önceden dolduruldu;
            bu bağlantı lead kayıtlarında korunur.
          </span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="font-serif text-h4 font-semibold text-foreground">
          Hangi pazarda, hangi ürün için alıcı arıyorsunuz?
        </h2>
        <p className="mt-1.5 text-small text-muted">
          Bir ülke ve ürün yazın; Lead Finder ücretsiz kaynaklardan aday firmaları ve mağazaları
          keşfeder, doğrular, sınıflandırır ve önceliklendirir.
        </p>

        <form action={formAction} className="mt-6 grid gap-5">
          {/* RADAR linkage — carried through as hidden fields (§2) */}
          {prefill?.radarSnapshotId ? <input type="hidden" name="radarSnapshotId" value={prefill.radarSnapshotId} /> : null}
          {prefill?.categoryKey ? <input type="hidden" name="categoryKey" value={prefill.categoryKey} /> : null}
          {prefill?.hs6 ? <input type="hidden" name="hs6" value={prefill.hs6} /> : null}
          {prefill?.radarScore ? <input type="hidden" name="radarScore" value={prefill.radarScore} /> : null}
          {prefill?.radarDecision ? <input type="hidden" name="radarDecision" value={prefill.radarDecision} /> : null}

          {/* Business model */}
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Ticari Model</span>
            <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-1">
              {(["B2B", "B2C"] as Model[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-small font-medium transition-colors",
                    model === m ? "bg-navy-950 text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  {m === "B2B" ? <Building2 className="size-3.5" aria-hidden="true" /> : <ShoppingCart className="size-3.5" aria-hidden="true" />}
                  {m}
                </button>
              ))}
            </div>
            <input type="hidden" name="businessModel" value={model} />
            <span className="text-caption text-subtle">
              {model === "B2B"
                ? "Öncelik: ithalatçı, distribütör, toptancı gibi ticari alıcılar."
                : "Öncelik: perakende mağaza, zincir, e-ticaret gibi tüketici kanalları."}
            </span>
          </div>

          {/* Country + city */}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Ülke / Pazar</span>
              <div className="relative">
                <select name="countryCode" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={selectCls}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Şehir <span className="font-normal text-subtle">(opsiyonel)</span></span>
              <div className="relative">
                <input name="city" placeholder="ör. Berlin, Hamburg, München" className={inputCls} />
                <MapPin className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              </div>
            </label>
          </div>

          {/* Product */}
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Ürün</span>
            <input
              name="productQuery"
              defaultValue={prefill?.productQuery ?? ""}
              placeholder="ör. kadın iç giyim, kablosuz kulaklık, mutfak ekipmanı"
              className={inputCls}
            />
            <span className="text-caption text-subtle">
              Doğal dilde yazabilirsiniz. Sistem yerel dillerde (Almanca/İngilizce) arama terimleri üretir.
            </span>
          </label>

          {/* Lead types */}
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Lead türleri</span>
            <p className="text-caption text-subtle">Hiçbiri seçilmezse tüm türler aranır.</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {LEAD_ROLES.filter((r) => r.key !== "other").map((r) => {
                const active = selectedRoles.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRole(r.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-small font-medium transition-colors",
                      active
                        ? "border-navy-950 bg-navy-950 text-white"
                        : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="leadTypes" value={selectedRoles.join(",")} />
          </div>

          <div>
            <button
              type="submit"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-navy-950 px-7 text-body font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Search className="size-4" aria-hidden="true" /> Lead Bul
            </button>
          </div>
        </form>
      </section>

      <p className="flex items-start gap-2 text-caption text-subtle">
        <Play className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Lead Finder ücretsiz kaynak önceliklidir; ücretli bir API'ye otomatik geçmez ve veri
        bulunamadığında bunu açıkça belirtir.
      </p>
    </div>
  );
}
