"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { ResolvedSettings } from "@/config/settings";
import { SOCIAL_FIELDS } from "@/config/settings";
import {
  updateSettingsAction,
  type SettingsState,
} from "@/app/(admin)/admin/(dashboard)/settings/actions";

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-small text-foreground outline-none transition-colors focus:border-accent";
const labelCls = "text-small font-medium text-foreground";

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-h6 font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-caption text-subtle">{description}</p> : null}
      <div className="mt-5 grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, name, defaultValue, placeholder, hint }: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className={inputCls} />
      {hint ? <span className="text-caption text-subtle">{hint}</span> : null}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: ResolvedSettings }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    {},
  );
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Card title="İletişim bilgileri" description="Footer ve iletişim sayfasında görünen bilgiler.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-posta" name="companyEmail" defaultValue={settings.companyEmail} />
          <Field label="Telefon" name="companyPhone" defaultValue={settings.companyPhone} hint="Görünen numara; tıklama bağlantısı otomatik oluşturulur." />
        </div>
        <Field label="Adres / konum" name="companyLocation" defaultValue={settings.companyLocation} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Çalışma saatleri (kısa)" name="hoursShort" defaultValue={settings.hoursShort} hint="Footer'da görünür." />
          <Field label="Çalışma saatleri (uzun)" name="hoursLong" defaultValue={settings.hoursLong} hint="İletişim sayfasında görünür." />
        </div>
      </Card>

      <Card title="Sosyal medya" description="Doldurduğunuz hesaplar footer'da ikon olarak görünür. Boş bırakılanlar gizlenir.">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              name={f.key}
              defaultValue={settings[f.key]}
              placeholder={f.placeholder}
            />
          ))}
        </div>
      </Card>

      <Card title="Analitik" description="Kimlik girildiğinde ilgili takip otomatik devreye girer; boşsa kapalı kalır.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Google Analytics (GA4) kimliği" name="ga4Id" defaultValue={settings.ga4Id} placeholder="G-XXXXXXXXXX" />
          <Field label="Microsoft Clarity kimliği" name="clarityId" defaultValue={settings.clarityId} placeholder="xxxxxxxxxx" />
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-surface/80 px-4 py-4 backdrop-blur">
        {savedFlash ? (
          <span className="inline-flex items-center gap-1.5 text-small font-medium text-[#2f7a48]">
            <Check className="size-4" /> Kaydedildi
          </span>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-5 text-small font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Ayarları kaydet
        </button>
      </div>
    </form>
  );
}
