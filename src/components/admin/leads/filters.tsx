"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { LEAD_ROLES, SIZE_LABELS, PRODUCT_FIT_LABELS, PRIORITY_LABELS, MODEL_FIT_META } from "@/config/leads";

/**
 * Result filters (§24). Updates the URL query so the filtered view is
 * shareable/bookmarkable and — crucially — so Export can read the SAME filters
 * and export exactly what is on screen (§27). Filtering itself happens server-
 * side from these params; this component only edits them.
 */

const selectCls =
  "h-10 appearance-none rounded-lg border border-border bg-surface pl-3 pr-9 text-small text-foreground outline-none transition-colors focus:border-accent";

export function LeadFilters({ cities }: { cities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const role = params.get("role") ?? "";
  const size = params.get("size") ?? "";
  const city = params.get("city") ?? "";
  const minScore = params.get("minScore") ?? "";
  const fit = params.get("fit") ?? "";
  const priority = params.get("priority") ?? "";
  const model = params.get("model") ?? "";
  const modelFit = params.get("modelFit") ?? "";
  const website = params.get("website") ?? "";
  const contact = params.get("contact") ?? "";
  const social = params.get("social") ?? "";
  const hasAny = role || size || city || minScore || fit || priority || model || modelFit || website || contact || social;

  function Select({
    label, value, onChange, children,
  }: {
    label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
  }) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</span>
        <div className="relative">
          <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
        </div>
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <Select label="Ticari rol" value={role} onChange={(v) => setParam("role", v)}>
        <option value="">Tümü</option>
        {LEAD_ROLES.filter((r) => r.key !== "other").map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </Select>

      <Select label="Boyut" value={size} onChange={(v) => setParam("size", v)}>
        <option value="">Tümü</option>
        {Object.entries(SIZE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </Select>

      {cities.length > 0 ? (
        <Select label="Şehir" value={city} onChange={(v) => setParam("city", v)}>
          <option value="">Tümü</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      ) : null}

      <Select label="Öncelik" value={priority} onChange={(v) => setParam("priority", v)}>
        <option value="">Tümü</option>
        {(["HIGH", "MEDIUM", "LOW", "DO_NOT"] as const).map((k) => (
          <option key={k} value={k}>{PRIORITY_LABELS[k]}</option>
        ))}
      </Select>

      <Select label="Lead Score" value={minScore} onChange={(v) => setParam("minScore", v)}>
        <option value="">Tümü</option>
        <option value="90">90+</option>
        <option value="80">80+</option>
        <option value="70">70+</option>
        <option value="60">60+</option>
      </Select>

      <Select label="Ürün uyumu" value={fit} onChange={(v) => setParam("fit", v)}>
        <option value="">Tümü</option>
        {Object.entries(PRODUCT_FIT_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </Select>

      <Select label="Uygunluk" value={modelFit} onChange={(v) => setParam("modelFit", v)}>
        <option value="">Tümü</option>
        <option value="VERIFIED">{MODEL_FIT_META.VERIFIED.label}</option>
        <option value="POSSIBLE">{MODEL_FIT_META.POSSIBLE.label}</option>
        <option value="UNVERIFIED">{MODEL_FIT_META.UNVERIFIED.label}</option>
        <option value="NOT_SUITABLE">{MODEL_FIT_META.NOT_SUITABLE.label} (gizli)</option>
      </Select>

      <Select label="Model" value={model} onChange={(v) => setParam("model", v)}>
        <option value="">Tümü</option>
        <option value="B2B">B2B</option>
        <option value="B2C">B2C</option>
      </Select>

      <Select label="Website" value={website} onChange={(v) => setParam("website", v)}>
        <option value="">Tümü</option>
        <option value="yes">Aktif website</option>
      </Select>

      <Select label="İletişim" value={contact} onChange={(v) => setParam("contact", v)}>
        <option value="">Tümü</option>
        <option value="yes">Karar verici bulundu</option>
      </Select>

      <Select label="Sosyal" value={social} onChange={(v) => setParam("social", v)}>
        <option value="">Tümü</option>
        <option value="yes">Sosyal doğrulandı</option>
      </Select>

      {hasAny ? (
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-small font-medium text-muted transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" /> Temizle
        </button>
      ) : null}
    </div>
  );
}
