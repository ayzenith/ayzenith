"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TradeDocumentDTO } from "@/server/os/trade-documents";
import {
  updateDocumentFieldsAction,
  updateLineMetaAction,
  finalizeDocumentAction,
  cancelDocumentAction,
  deleteDraftAction,
  newVersionAction,
  duplicateDocumentAction,
} from "../../app/(business)/os/documents/actions";
import { CURRENCIES } from "@/config/os";
import { docTitle, LANGUAGES, LANGUAGE_LABELS, INCOTERMS } from "@/config/trade-documents";
import { Badge, btn, input as inputCls } from "@/components/os/ui";

/**
 * The editor's whole point: a change on the left is visible on the right
 * within about half a second, rendered by the exact same page the PDF uses
 * (see /doc/[id]/print). Every field autosaves (debounced) via a server
 * action; there is no separate "save" step to forget.
 */

type Props = {
  doc: TradeDocumentDTO;
  signatories: Array<{ id: string; name: string; title: string | null }>;
  bankAccounts: Array<{ id: string; label: string; currency: string }>;
};

type FormState = {
  language: TradeDocumentDTO["language"];
  currency: string;
  validUntil: string;
  incoterm: string;
  shippingMethod: string;
  countryOfOrigin: string;
  paymentTermsOverride: string;
  deliveryTermsOverride: string;
  customerNote: string;
  paymentNote: string;
  deliveryNote: string;
  specialTerms: string;
  footerNote: string;
  shipToName: string;
  shipToAddress: string;
  shipToCity: string;
  shipToPostal: string;
  shipToCountry: string;
  showBankDetails: boolean;
  showVat: boolean;
  showHsCode: boolean;
  showCountryOrigin: boolean;
  showSignature: boolean;
  showShipping: boolean;
  signatoryId: string;
  bankAccountId: string;
};

function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function initialState(doc: TradeDocumentDTO): FormState {
  return {
    language: doc.language,
    currency: doc.currency,
    validUntil: toDateInput(doc.validUntil),
    incoterm: doc.incoterm ?? "",
    shippingMethod: doc.shippingMethod ?? "",
    countryOfOrigin: doc.countryOfOrigin ?? "",
    paymentTermsOverride: doc.paymentTermsOverride ?? "",
    deliveryTermsOverride: doc.deliveryTermsOverride ?? "",
    customerNote: doc.customerNote ?? "",
    paymentNote: doc.paymentNote ?? "",
    deliveryNote: doc.deliveryNote ?? "",
    specialTerms: doc.specialTerms ?? "",
    footerNote: doc.footerNote ?? "",
    shipToName: doc.shipTo?.name ?? "",
    shipToAddress: doc.shipTo?.address ?? "",
    shipToCity: doc.shipTo?.city ?? "",
    shipToPostal: doc.shipTo?.postal ?? "",
    shipToCountry: doc.shipTo?.country ?? "",
    showBankDetails: doc.show.bankDetails,
    showVat: doc.show.vat,
    showHsCode: doc.show.hsCode,
    showCountryOrigin: doc.show.countryOfOrigin,
    showSignature: doc.show.signature,
    showShipping: doc.show.shipping,
    signatoryId: doc.signatoryId ?? "",
    bankAccountId: doc.bankAccountId ?? "",
  };
}

const section = "flex flex-col gap-3 border-b border-border pb-5";
const label = "text-caption font-medium text-muted";

export function DocumentEditor({ doc, signatories, bankAccounts }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(doc));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [zoom, setZoom] = useState(0.85);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = doc.status === "DRAFT";

  const previewSrc = useMemo(() => `/doc/${doc.id}/print?v=${nonce}`, [doc.id, nonce]);

  function schedule(patch: Partial<FormState>, mapToServer: () => Record<string, unknown>) {
    if (!editable) return;
    setForm((f) => ({ ...f, ...patch }));
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const payload = mapToServer();
      const res = await updateDocumentFieldsAction(doc.id, payload);
      if (res.ok) {
        setStatus("saved");
        setNonce((n) => n + 1);
      } else {
        setStatus("error");
        setErrorMsg(res.error ?? "Kaydedilemedi.");
      }
    }, 550);
  }

  function field<K extends keyof FormState>(key: K, serverKey?: string) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const v = e.target.value;
        schedule({ [key]: v } as Partial<FormState>, () => ({ [serverKey ?? key]: v === "" ? null : v }));
      },
    };
  }

  function checkbox<K extends keyof FormState>(key: K) {
    return {
      checked: form[key] as boolean,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.checked;
        schedule({ [key]: v } as Partial<FormState>, () => ({ [key]: v }));
      },
    };
  }

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100vh-1px)] flex-col sm:-mx-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/os/sales/${doc.sale.id}?tab=belgeler`} className="text-caption font-medium text-subtle hover:text-foreground">
            ← {doc.sale.code}
          </Link>
          <div className="min-w-0">
            <p className="truncate text-small font-semibold text-foreground">{docTitle("TR", doc.docType)} · {doc.code}</p>
          </div>
          <Badge tone={doc.status === "FINAL" ? "success" : doc.status === "CANCELLED" ? "neutral" : "warning"}>
            {doc.status === "DRAFT" ? "Taslak" : doc.status === "FINAL" ? "Kesin" : "İptal"}
          </Badge>
          {editable ? (
            <span className="text-caption text-subtle">
              {status === "saving" ? "Kaydediliyor…" : status === "saved" ? "Kaydedildi" : status === "error" ? errorMsg : ""}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <form action={finalizeDocumentAction}>
              <input type="hidden" name="id" value={doc.id} />
              <button className={btn.secondary} type="submit">Kesinleştir</button>
            </form>
          ) : null}
          {editable ? (
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={doc.id} />
              <input type="hidden" name="saleId" value={doc.sale.id} />
              <button className={btn.danger} type="submit">Sil</button>
            </form>
          ) : (
            <form action={newVersionAction}>
              <input type="hidden" name="id" value={doc.id} />
              <button className={btn.secondary} type="submit">Yeni versiyon</button>
            </form>
          )}
          <form action={duplicateDocumentAction}>
            <input type="hidden" name="id" value={doc.id} />
            <button className={btn.secondary} type="submit">Kopyala</button>
          </form>
          {doc.status !== "CANCELLED" ? (
            <form action={cancelDocumentAction}>
              <input type="hidden" name="id" value={doc.id} />
              <button className={btn.ghost} type="submit">İptal et</button>
            </form>
          ) : null}
          <a className={btn.secondary} href={`/os/export?kind=trade-document&id=${doc.id}`}>
            Excel
          </a>
          <a className={btn.primary} href={`/os/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer">
            PDF indir
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: settings */}
        <div className="w-full max-w-md shrink-0 overflow-y-auto border-r border-border bg-surface p-5">
          {!editable ? (
            <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-caption text-warning">
              Bu belge {doc.status === "FINAL" ? "kesinleşti" : "iptal edildi"}; düzenlenemez. Değişiklik için &quot;Yeni versiyon&quot; oluştur.
            </p>
          ) : null}

          <fieldset disabled={!editable} className="flex flex-col gap-6">
            {/* System data */}
            <div className={section}>
              <p className="text-small font-semibold text-foreground">Sistem verisi</p>
              <div className="grid grid-cols-2 gap-2 text-caption text-muted">
                <span>Müşteri</span><span className="text-foreground">{doc.sale.customer?.name ?? "—"}</span>
                <span>Kalem sayısı</span><span className="text-foreground">{doc.lines.length}</span>
                <span>Toplam</span><span className="text-foreground">{doc.totals.total.toLocaleString("tr-TR")} {doc.currency}</span>
              </div>
              <Link href={`/os/sales/${doc.sale.id}`} className="text-caption font-medium text-navy-900 hover:underline">
                Satışı düzenle →
              </Link>
            </div>

            {/* Document settings */}
            <div className={section}>
              <p className="text-small font-semibold text-foreground">Belge ayarları</p>
              <label className="flex flex-col gap-1"><span className={label}>Dil</span>
                <select className={inputCls} {...field("language")}>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Para birimi</span>
                <select className={inputCls} {...field("currency")}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Geçerlilik tarihi</span>
                <input type="date" className={inputCls} {...field("validUntil")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Yetkili imza</span>
                <select
                  className={inputCls}
                  value={form.signatoryId}
                  onChange={(e) => {
                    const v = e.target.value;
                    schedule({ signatoryId: v }, () => ({ signatoryId: v || null }));
                  }}
                >
                  <option value="">{doc.signatory?.name ?? "— seçilmedi —"}</option>
                  {signatories.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` — ${s.title}` : ""}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Banka hesabı</span>
                <select
                  className={inputCls}
                  value={form.bankAccountId}
                  onChange={(e) => {
                    const v = e.target.value;
                    schedule({ bankAccountId: v }, () => ({ bankAccountId: v || null }));
                  }}
                >
                  <option value="">{doc.bankAccount ? `${doc.bankAccount.bankName} — ${doc.bankAccount.currency}` : "— seçilmedi —"}</option>
                  {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Incoterm</span>
                <input list="incoterms" className={inputCls} placeholder="FOB, CIF, EXW…" {...field("incoterm")} />
                <datalist id="incoterms">{INCOTERMS.map((i) => <option key={i} value={i} />)}</datalist>
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Nakliye yöntemi</span>
                <input className={inputCls} placeholder="Sea freight, Air, Road…" {...field("shippingMethod")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Menşe ülke</span>
                <input className={inputCls} placeholder="Türkiye" {...field("countryOfOrigin")} />
              </label>
            </div>

            {/* Document override */}
            <div className={section}>
              <p className="text-small font-semibold text-foreground">Belgeye özel metinler</p>
              <label className="flex flex-col gap-1"><span className={label}>Ödeme şartları (bu belgeye özel)</span>
                <input className={inputCls} placeholder={doc.sale.paymentTermDays ? `${doc.sale.paymentTermDays} gün (varsayılan)` : "—"} {...field("paymentTermsOverride")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Teslimat şartları</span>
                <input className={inputCls} {...field("deliveryTermsOverride")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Müşteri notu</span>
                <textarea className={inputCls} rows={2} {...field("customerNote")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Ödeme notu</span>
                <textarea className={inputCls} rows={2} {...field("paymentNote")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Teslimat notu</span>
                <textarea className={inputCls} rows={2} {...field("deliveryNote")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Özel şartlar</span>
                <textarea className={inputCls} rows={2} {...field("specialTerms")} />
              </label>
              <label className="flex flex-col gap-1"><span className={label}>Alt bilgi notu</span>
                <textarea className={inputCls} rows={2} {...field("footerNote")} />
              </label>
            </div>

            {/* Ship-to */}
            <div className={section}>
              <label className="flex items-center gap-2 text-small font-semibold text-foreground">
                <input type="checkbox" className="size-4 rounded border-border" {...checkbox("showShipping")} />
                Teslimat adresi göster
              </label>
              {form.showShipping ? (
                <>
                  <input className={inputCls} placeholder="Ad / firma" {...field("shipToName")} />
                  <input className={inputCls} placeholder="Adres" {...field("shipToAddress")} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Şehir" {...field("shipToCity")} />
                    <input className={inputCls} placeholder="Posta kodu" {...field("shipToPostal")} />
                  </div>
                  <input className={inputCls} placeholder="Ülke" {...field("shipToCountry")} />
                </>
              ) : null}
            </div>

            {/* Layout toggles */}
            <div className={section}>
              <p className="text-small font-semibold text-foreground">Görünüm</p>
              {([
                ["showBankDetails", "Banka bilgileri"],
                ["showVat", "KDV"],
                ["showHsCode", "GTİP kodu"],
                ["showCountryOrigin", "Menşe ülke"],
                ["showSignature", "İmza"],
              ] as const).map(([key, text]) => (
                <label key={key} className="flex items-center gap-2 text-small text-foreground">
                  <input type="checkbox" className="size-4 rounded border-border" {...checkbox(key)} />
                  {text}
                </label>
              ))}
            </div>

            {(form.showHsCode || form.showCountryOrigin || doc.docType === "PACKING_LIST") ? (
              <div className={section}>
                <p className="text-small font-semibold text-foreground">Kalem detayları</p>
                <div className="flex flex-col gap-3">
                  {doc.lines.map((l) => (
                    <LineMetaRow key={l.id} documentId={doc.id} line={l} docType={doc.docType} showHsCode={form.showHsCode} showCountryOrigin={form.showCountryOrigin} editable={editable} onSaved={() => setNonce((n) => n + 1)} />
                  ))}
                </div>
              </div>
            ) : null}
          </fieldset>
        </div>

        {/* Right: live A4 preview */}
        <div className="flex flex-1 flex-col bg-[#E9EBEF]">
          <div className="flex items-center justify-center gap-2 border-b border-border bg-surface px-4 py-2">
            <button className={btn.ghost} onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} type="button">−</button>
            <span className="w-12 text-center text-caption tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
            <button className={btn.ghost} onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} type="button">+</button>
            <button className={btn.ghost} onClick={() => setZoom(0.85)} type="button">Sığdır</button>
            <button className={btn.ghost} onClick={() => setZoom(1)} type="button">Gerçek boy</button>
            <a className={btn.ghost} href={previewSrc} target="_blank" rel="noreferrer">Tam ekran</a>
          </div>
          <div className="flex-1 overflow-auto p-8">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 120ms ease" }}>
              <iframe
                key={nonce}
                src={previewSrc}
                title="Belge önizleme"
                className="border-0 shadow-[0_2px_24px_rgba(14,36,57,0.18)]"
                style={{ width: doc.docType === "PACKING_LIST" ? "297mm" : "210mm", height: doc.docType === "PACKING_LIST" ? "210mm" : "297mm", background: "#fff" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineMetaRow({
  documentId, line, docType, showHsCode, showCountryOrigin, editable, onSaved,
}: {
  documentId: string;
  line: TradeDocumentDTO["lines"][number];
  docType: TradeDocumentDTO["docType"];
  showHsCode: boolean;
  showCountryOrigin: boolean;
  editable: boolean;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    hsCode: line.hsCode ?? "",
    countryOfOrigin: line.countryOfOrigin ?? "",
    packages: line.packages != null ? String(line.packages) : "",
    netWeight: line.netWeight != null ? String(line.netWeight) : "",
    grossWeight: line.grossWeight != null ? String(line.grossWeight) : "",
    dimensions: line.dimensions ?? "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function save(next: typeof v) {
    if (!editable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateLineMetaAction(documentId, line.saleLineId, {
        hsCode: next.hsCode || null,
        countryOfOrigin: next.countryOfOrigin || null,
        packages: next.packages ? Number.parseInt(next.packages, 10) : null,
        netWeight: next.netWeight ? Number.parseFloat(next.netWeight) : null,
        grossWeight: next.grossWeight ? Number.parseFloat(next.grossWeight) : null,
        dimensions: next.dimensions || null,
      });
      onSaved();
    }, 550);
  }

  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="mb-1.5 truncate text-caption font-medium text-foreground">{line.sku} — {line.name}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {showHsCode ? <input className={inputCls} placeholder="GTİP" value={v.hsCode} onChange={(e) => { const n = { ...v, hsCode: e.target.value }; setV(n); save(n); }} /> : null}
        {showCountryOrigin ? <input className={inputCls} placeholder="Menşe" value={v.countryOfOrigin} onChange={(e) => { const n = { ...v, countryOfOrigin: e.target.value }; setV(n); save(n); }} /> : null}
        {docType === "PACKING_LIST" ? (
          <>
            <input className={inputCls} placeholder="Koli" value={v.packages} onChange={(e) => { const n = { ...v, packages: e.target.value }; setV(n); save(n); }} />
            <input className={inputCls} placeholder="Net kg" value={v.netWeight} onChange={(e) => { const n = { ...v, netWeight: e.target.value }; setV(n); save(n); }} />
            <input className={inputCls} placeholder="Brüt kg" value={v.grossWeight} onChange={(e) => { const n = { ...v, grossWeight: e.target.value }; setV(n); save(n); }} />
            <input className={inputCls} placeholder="Ölçüler" value={v.dimensions} onChange={(e) => { const n = { ...v, dimensions: e.target.value }; setV(n); save(n); }} />
          </>
        ) : null}
      </div>
    </div>
  );
}
