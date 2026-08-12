"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, Check, RotateCcw, Pencil } from "lucide-react";
import { saveContentAction } from "@/app/(admin)/admin/(dashboard)/content/actions";

/** One editable string, in all three languages, with any saved override. */
export type EditorField = {
  key: string;
  label: string;
  def: { tr: string; en: string; de: string };
  ov: { tr: string | null; en: string | null; de: string | null } | null;
};

/** A page/section grouping of fields. */
export type EditorGroup = {
  title: string;
  hint?: string;
  fields: EditorField[];
};

type Lang = "tr" | "en" | "de";
const LANGS: { id: Lang; label: string }[] = [
  { id: "tr", label: "Türkçe" },
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
];

/**
 * The "Sayfalar & Metinler" editor. Groups every site string by page/section
 * (collapsible), lets the owner search, and edits each string in TR/EN/DE.
 * Saving persists an override that appears on the public site immediately; an
 * empty field falls back to the original text. "Orijinale döndür" clears the
 * override entirely.
 */
export function ContentEditor({
  groups,
  overriddenCount,
}: {
  groups: EditorGroup[];
  overriddenCount: number;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("tr");

  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          const hay = [
            f.key,
            f.label,
            f.def.tr,
            f.def.en,
            f.def.de,
            f.ov?.tr ?? "",
            f.ov?.en ?? "",
            f.ov?.de ?? "",
          ]
            .join(" ")
            .toLocaleLowerCase("tr");
          return hay.includes(q);
        }),
      }))
      .filter((g) => g.fields.length > 0);
  }, [groups, q]);

  const totalFields = useMemo(
    () => groups.reduce((n, g) => n + g.fields.length, 0),
    [groups],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar: search + summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Metin, başlık veya sayfa ara…"
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-small text-foreground outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-3 text-caption text-subtle">
          <span>{totalFields} metin</span>
          {overriddenCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
              <Pencil className="size-3" /> {overriddenCount} değiştirildi
            </span>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-small text-muted">
          Aramanızla eşleşen metin bulunamadı.
        </p>
      ) : (
        filtered.map((group) => (
          <GroupCard key={group.title} group={group} defaultOpen={!!q} />
        ))
      )}
    </div>
  );
}

function GroupCard({ group, defaultOpen }: { group: EditorGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const changed = group.fields.filter((f) => f.ov).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-navy-950/[0.02]"
      >
        <div className="min-w-0">
          <h2 className="truncate font-sans text-body font-semibold text-foreground">
            {group.title}
          </h2>
          {group.hint ? (
            <p className="mt-0.5 truncate text-caption text-subtle">{group.hint}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {changed > 0 ? (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-caption font-medium text-accent">
              {changed}
            </span>
          ) : null}
          <span className="text-caption text-subtle">{group.fields.length}</span>
          <ChevronDown
            className={"size-4 text-subtle transition-transform " + (open ? "rotate-180" : "")}
          />
        </div>
      </button>

      {open ? (
        <div className="divide-y divide-border border-t border-border">
          {group.fields.map((field) => (
            <FieldRow key={field.key} field={field} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FieldRow({ field }: { field: EditorField }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current override state (mutable in the client after save).
  const [ov, setOv] = useState(field.ov);

  // Working values: prefilled with the override if present, else the default.
  const [values, setValues] = useState<Record<Lang, string>>({
    tr: field.ov?.tr ?? field.def.tr,
    en: field.ov?.en ?? field.def.en,
    de: field.ov?.de ?? field.def.de,
  });

  const isOverridden = !!ov;

  // "Dirty" = the working values differ from what is effectively shown today.
  const baseline: Record<Lang, string> = {
    tr: ov?.tr ?? field.def.tr,
    en: ov?.en ?? field.def.en,
    de: ov?.de ?? field.def.de,
  };
  const dirty =
    values.tr !== baseline.tr || values.en !== baseline.en || values.de !== baseline.de;

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("key", field.key);
    // Only send a language when it differs from the default → keeps overrides
    // minimal and lets untouched languages keep following the original text.
    fd.set("tr", values.tr === field.def.tr ? "" : values.tr);
    fd.set("en", values.en === field.def.en ? "" : values.en);
    fd.set("de", values.de === field.def.de ? "" : values.de);
    startTransition(async () => {
      const res = await saveContentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Kaydedilemedi.");
        return;
      }
      const next = {
        tr: values.tr === field.def.tr ? null : values.tr,
        en: values.en === field.def.en ? null : values.en,
        de: values.de === field.def.de ? null : values.de,
      };
      setOv(next.tr || next.en || next.de ? next : null);
      flash();
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    const fd = new FormData();
    fd.set("key", field.key);
    fd.set("tr", "");
    fd.set("en", "");
    fd.set("de", "");
    startTransition(async () => {
      const res = await saveContentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "İşlem başarısız.");
        return;
      }
      setOv(null);
      setValues({ tr: field.def.tr, en: field.def.en, de: field.def.de });
      flash();
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-small font-medium text-foreground">{field.label}</span>
        {isOverridden ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-caption font-medium text-accent">
            değiştirildi
          </span>
        ) : null}
        <code className="ml-auto truncate text-caption text-subtle">{field.key}</code>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {LANGS.map((lang) => (
          <label key={lang.id} className="flex flex-col gap-1">
            <span className="text-caption font-medium uppercase tracking-wide text-subtle">
              {lang.label}
            </span>
            <AutoField
              value={values[lang.id]}
              onChange={(v) => setValues((s) => ({ ...s, [lang.id]: v }))}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saved ? <Check className="size-4" /> : null}
          {saved ? "Kaydedildi" : "Kaydet"}
        </button>
        {isOverridden ? (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-small font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" /> Orijinale döndür
          </button>
        ) : null}
        {error ? <span className="text-caption text-[#8a2b2b]">{error}</span> : null}
      </div>
    </div>
  );
}

/** Grows into a textarea for longer copy, stays a single input for short labels. */
function AutoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const multiline = value.length > 60 || value.includes("\n");
  const cls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-small text-foreground outline-none transition-colors focus:border-accent";
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(8, Math.max(2, Math.ceil(value.length / 48)))}
        className={cls + " resize-y"}
      />
    );
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
}
