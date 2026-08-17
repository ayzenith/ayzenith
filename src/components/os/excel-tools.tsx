"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react";
import {
  previewImportAction, runImportAction,
  type PreviewState, type RunState,
} from "@/app/(business)/os/import-actions";
import { btn, input } from "./ui";

/**
 * The Excel toolbar every list screen carries.
 *
 * The import is a guided three-step flow rather than a silent upload, because a
 * spreadsheet written by a human is unpredictable and a silent importer that
 * guesses is how a database fills with rubbish:
 *
 *   1. UPLOAD — read only. Nothing is written.
 *   2. CHECK  — the columns we matched, with a dropdown to correct any of them,
 *      and the first rows shown as we read them.
 *   3. RESULT — how many landed, how many were rejected, and a download of
 *      exactly the rejected rows with the reason on each.
 *
 * The file never leaves the browser between steps 1 and 3; the same File object
 * is posted again on confirm.
 */

export function ExcelTools({
  entity,
  entityLabel,
  exportHref,
  className,
}: {
  entity: string;
  entityLabel: string;
  exportHref: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <a href={exportHref} className={btn.secondary}>
          <Download className="size-4" aria-hidden="true" />
          Excel&apos;e aktar
        </a>
        <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>
          <Upload className="size-4" aria-hidden="true" />
          Excel&apos;den içe aktar
        </button>
      </div>
      {open ? (
        <ImportDialog entity={entity} entityLabel={entityLabel} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

type Step = "pick" | "map" | "done";

function ImportDialog({
  entity,
  entityLabel,
  onClose,
}: {
  entity: string;
  entityLabel: string;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<Extract<PreviewState, { ok: true }> | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Extract<RunState, { ok: true }>["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function analyze() {
    const f = fileRef.current?.files?.[0] ?? null;
    if (!f) {
      setError("Önce bir dosya seç.");
      return;
    }
    setError(null);
    setFile(f);
    const fd = new FormData();
    fd.append("entity", entity);
    fd.append("file", f);
    start(async () => {
      const res = await previewImportAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res);
      setMapping(res.preview.mapping);
      setStep("map");
    });
  }

  function run() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("entity", entity);
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    start(async () => {
      const res = await runImportAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setStep("done");
    });
  }

  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  const missing = preview
    ? preview.fields.filter((f) => f.required && !mappedKeys.has(f.key))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="size-5 text-muted" aria-hidden="true" />
            <h2 className="text-small font-semibold text-foreground">
              {entityLabel} — Excel&apos;den içe aktar
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className={btn.ghost}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-5">
          {error ? (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3.5 py-2.5 text-small text-error">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          {step === "pick" ? (
            <div className="flex flex-col gap-4">
              <p className="text-small text-muted">
                Excel dosyanın ilk satırı başlık olmalı. Sütun adlarını kendimiz tanımaya çalışırız;
                tanıyamazsak bir sonraki adımda sen eşleştirirsin.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-small text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-sunken file:px-3.5 file:py-2 file:text-small file:font-medium file:text-foreground"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={analyze} disabled={pending} className={btn.primary}>
                  {pending ? "Okunuyor…" : "Dosyayı oku"}
                </button>
                <a href={`/os/template?entity=${entity}`} className={btn.secondary}>
                  <Download className="size-4" aria-hidden="true" />
                  Örnek şablonu indir
                </a>
              </div>
            </div>
          ) : null}

          {step === "map" && preview ? (
            <div className="flex flex-col gap-4">
              <p className="text-small text-muted">
                <strong className="font-semibold text-foreground">{preview.preview.totalRows}</strong> satır bulundu.
                Sütun eşleştirmesini kontrol et; yanlış olanı değiştirebilir, gereksiz olanı
                &quot;Aktarma&quot; yapabilirsin.
              </p>

              {missing.length > 0 ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-small text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Zorunlu alan eşleşmedi: {missing.map((m) => m.label).join(", ")}
                </p>
              ) : null}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-small">
                  <thead className="sticky top-0 bg-surface-sunken">
                    <tr>
                      <th className="border-b border-border px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-subtle">
                        Excel sütunu
                      </th>
                      <th className="border-b border-border px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-subtle">
                        Örnek değer
                      </th>
                      <th className="border-b border-border px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-subtle">
                        Aktarılacak alan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.headers.map((h, i) => (
                      <tr key={`${h}-${i}`}>
                        <td className="border-b border-border/60 px-3 py-2 font-medium text-foreground">{h || `Sütun ${i + 1}`}</td>
                        <td className="max-w-[12rem] truncate border-b border-border/60 px-3 py-2 text-subtle">
                          {preview.preview.sample[0]?.[i] ?? ""}
                        </td>
                        <td className="border-b border-border/60 px-3 py-2">
                          <select
                            value={mapping[i] ?? ""}
                            onChange={(e) => {
                              const next = { ...mapping };
                              if (e.target.value) next[i] = e.target.value;
                              else delete next[i];
                              setMapping(next);
                            }}
                            className={`${input} py-1.5`}
                          >
                            <option value="">Aktarma</option>
                            {preview.fields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                                {f.required ? " *" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={run} disabled={pending || missing.length > 0} className={btn.primary}>
                  {pending ? "Aktarılıyor…" : `${preview.preview.totalRows} satırı aktar`}
                </button>
                <button type="button" onClick={() => setStep("pick")} className={btn.secondary}>
                  Geri
                </button>
              </div>
            </div>
          ) : null}

          {step === "done" && result ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                <div className="text-small">
                  <p className="font-semibold text-foreground">
                    {result.created} yeni kayıt
                    {result.updated > 0 ? `, ${result.updated} güncelleme` : ""}
                  </p>
                  <p className="mt-0.5 text-muted">
                    Toplam {result.totalRows} satır okundu.
                    {result.failed > 0 ? ` ${result.failed} satır aktarılamadı.` : " Hepsi aktarıldı."}
                  </p>
                </div>
              </div>

              {result.failed > 0 ? (
                <>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-small">
                      <thead className="sticky top-0 bg-surface-sunken">
                        <tr>
                          <th className="border-b border-border px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-subtle">
                            Satır
                          </th>
                          <th className="border-b border-border px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-subtle">
                            Hata
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.slice(0, 50).map((e, i) => (
                          <tr key={i}>
                            <td className="border-b border-border/60 px-3 py-2 tabular-nums text-muted">{e.row}</td>
                            <td className="border-b border-border/60 px-3 py-2 text-foreground">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.batchId ? (
                    <a href={`/os/template?errors=${result.batchId}`} className={btn.secondary}>
                      <Download className="size-4" aria-hidden="true" />
                      Hatalı satırları Excel olarak indir
                    </a>
                  ) : null}
                </>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  // The list behind the dialog was revalidated server-side; this
                  // is what makes the new rows actually appear.
                  window.location.reload();
                }}
                className={btn.primary}
              >
                Kapat ve listeyi yenile
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
