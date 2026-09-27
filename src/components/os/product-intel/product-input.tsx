"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge, Field, input } from "@/components/os/ui";
import { previewAttributesAction } from "@/app/(business)/os/product-intel/actions";

/**
 * The product half of the new-analysis form, with a live reading of what the
 * system understood.
 *
 * The chips are not decoration. Everything downstream — the gap coverage, the
 * title validator's list of permitted claims — is built from exactly these
 * values, so showing them while the operator types is the difference between
 * "the analysis missed my 4000 mAh" discovered now and discovered after the
 * run. The parse is the real extractor behind a server action, never a
 * client-side approximation that could disagree with it.
 */
export function ProductInput() {
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [specText, setSpecText] = useState("");
  const [facets, setFacets] = useState<Array<{ key: string; label: string; value: string; from: string }>>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          setFacets(await previewAttributesAction({ productName, description, specText, brand }));
        } catch {
          // A preview failure must never block the form; the analysis itself
          // re-parses server-side anyway.
        }
      });
    }, 500);
    return () => clearTimeout(t);
  }, [productName, brand, description, specText]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ürün adı" required hint="Özellikleri adın içine yazabilirsin — okunacaktır.">
          <input
            name="productName"
            required
            className={input}
            placeholder="El Vantilatörü USB-C 4000 mAh 5 Kademe Dijital Ekran"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </Field>
        <Field label="Marka">
          <input name="brand" className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
      </div>

      <Field label="Açıklama" hint="Ürünü anlatan serbest metin.">
        <textarea name="description" rows={3} className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Field label="Teknik özellikler" hint="Datasheet, madde listesi, tedarikçiden gelen metin — ne varsa yapıştır.">
        <textarea
          name="specText"
          rows={5}
          className={input}
          placeholder={"Batarya: 4000 mAh\nŞarj: USB-C\n5 kademeli hız ayarı\nDijital ekran"}
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
        />
      </Field>

      <div className="rounded-lg border border-border bg-surface-sunken/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-caption font-medium text-foreground">Sistemin okuduğu özellikler</span>
          {pending ? <span className="text-caption text-subtle">okunuyor…</span> : null}
        </div>
        {facets.length === 0 ? (
          <p className="text-caption text-subtle">
            Henüz karşılaştırılabilir bir özellik okunamadı. Analiz yine çalışır, ama fırsat ve başlık bölümleri bu
            özelliklere dayanır — teknik değerleri yazmak sonucu belirgin şekilde iyileştirir.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {facets.map((f) => (
              <Badge key={f.key} tone="info">
                {f.label}: {f.value}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
