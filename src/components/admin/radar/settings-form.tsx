"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  updateRadarSettingsAction,
  type RadarSettingsState,
} from "@/app/(admin)/admin/(dashboard)/radar/settings/actions";
import { CRITERION_LABELS, type RadarCriterionKey } from "@/config/radar";
import { BURDEN_LABELS } from "./ui";

type Weights = Record<string, number>;

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-small text-foreground outline-none focus:border-accent";

const CRIT_ORDER: RadarCriterionKey[] = ["demand", "growth", "supplyAdvantage", "entry", "competition"];
const BURDENS: Array<{ v: string; l: string }> = [
  { v: "low", l: BURDEN_LABELS.low ?? "Düşük" },
  { v: "medium", l: BURDEN_LABELS.medium ?? "Orta" },
  { v: "high", l: BURDEN_LABELS.high ?? "Yüksek" },
  { v: "very-high", l: BURDEN_LABELS["very-high"] ?? "Çok yüksek" },
];

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-h6 font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-caption text-subtle">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function RadarSettingsForm({
  weights,
  thresholds,
  alertThreshold,
  cacheTtlDays,
  certificationBurden,
  categories,
}: {
  weights: Weights;
  thresholds: { worth: number; monitor: number };
  alertThreshold: number;
  cacheTtlDays: number;
  certificationBurden: Record<string, string>;
  categories: Array<{ key: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState<RadarSettingsState, FormData>(
    updateRadarSettingsAction,
    {},
  );
  const [w, setW] = useState<Weights>(weights);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.ok) { setSaved(true); const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t); }
  }, [state.ok]);

  const sum = useMemo(() => CRIT_ORDER.reduce((a, k) => a + (Number(w[k]) || 0), 0), [w]);
  const sumOk = sum === 100;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{state.error}</span>
        </div>
      ) : null}

      <Card title="Kriter ağırlıkları" description="Skorun nasıl hesaplandığını belirler. Toplam tam olarak 100 olmalı. Değişiklik yalnızca yeni analizleri etkiler; geçmiş analizler dondurulmuş ağırlıklarıyla kalır.">
        <div className="grid gap-4">
          {CRIT_ORDER.map((k) => (
            <label key={k} className="flex items-center gap-4">
              <span className="flex-1 text-small font-medium text-foreground">{CRITERION_LABELS[k]}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" name={`w_${k}`} min={0} max={100}
                  value={w[k] ?? 0}
                  onChange={(e) => setW((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                  className={`${inputCls} w-24 text-right`}
                />
                <span className="w-4 text-small text-subtle">%</span>
              </div>
            </label>
          ))}
          <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-small font-semibold ${sumOk ? "bg-[#eaf3ec] text-[#2f7a48]" : "bg-[#fbeaea] text-[#8a2b2b]"}`}>
            <span>Toplam</span>
            <span className="tabular-nums">%{sum} {sumOk ? "✓" : "— 100 olmalı"}</span>
          </div>
        </div>
      </Card>

      <Card title="Karar eşikleri" description="Bir skorun hangi bandda sayılacağını belirler.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Araştırmaya Değer (bu değer ve üzeri)</span>
            <input type="number" name="th_worth" min={1} max={100} defaultValue={thresholds.worth} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">İzlenmeli (bu değer ve üzeri)</span>
            <input type="number" name="th_monitor" min={1} max={100} defaultValue={thresholds.monitor} className={inputCls} />
          </label>
        </div>
        <p className="mt-2 text-caption text-subtle">Altında kalan skorlar “Şimdilik Öncelik Değil” sayılır.</p>
      </Card>

      <Card title="Takip & önbellek">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Uyarı eşiği (puan)</span>
            <input type="number" name="alertThreshold" min={1} max={50} defaultValue={alertThreshold} className={inputCls} />
            <span className="text-caption text-subtle">Takip edilen bir pazarda skor bu kadar değişince uyarı çıkar.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Veri önbelleği (gün)</span>
            <input type="number" name="cacheTtlDays" min={1} max={365} defaultValue={cacheTtlDays} className={inputCls} />
            <span className="text-caption text-subtle">Aynı veri bu süre boyunca yeniden çekilmez (API limitini korur).</span>
          </label>
        </div>
      </Card>

      <Card title="Sertifikasyon yükü" description="Her kategorinin düzenleyici giriş yükü — “Giriş Kolaylığı” kriterini ters yönde etkiler. Tahmin değil, sizin belirlediğiniz bir tablodur.">
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.key} className="flex items-center justify-between gap-3">
              <span className="text-small text-foreground">{c.label}</span>
              <select name={`cert_${c.key}`} defaultValue={certificationBurden[c.key] ?? "medium"} className={`${inputCls} w-40`}>
                {BURDENS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-surface/80 px-4 py-4 backdrop-blur">
        {saved ? <span className="inline-flex items-center gap-1.5 text-small font-medium text-[#2f7a48]"><Check className="size-4" /> Kaydedildi</span> : null}
        <button type="submit" disabled={pending || !sumOk} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-5 text-small font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Ayarları kaydet
        </button>
      </div>
    </form>
  );
}
