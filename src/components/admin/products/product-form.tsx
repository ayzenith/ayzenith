"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import type { AdminProduct } from "@/config/product-admin";
import type { MediaDTO } from "@/config/media";
import {
  AVAILABILITY_OPTIONS,
  BADGE_OPTIONS,
  CATEGORY_OPTIONS,
  MARKETPLACE_FIELDS,
  STATUS_OPTIONS,
} from "@/config/product-options";
import { SingleImagePicker, GalleryPicker } from "@/components/admin/media/media-picker";
import { saveProductAction, type ProductFormState } from "@/app/(admin)/admin/(dashboard)/products/actions";

/**
 * Product editor — a single trilingual form for create & edit. The whole product
 * is serialised into one JSON `payload` field on submit; the server action
 * validates and persists it. Localized text is edited one language at a time via
 * the language tabs (TR / EN / DE) to keep the form calm and readable.
 */

type LangText = Record<Locale, string>;
const LOCALES: { code: Locale; label: string }[] = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
];
const emptyText = (): LangText => ({ en: "", tr: "", de: "" });

type SpecRow = { label: LangText; value: string };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert a multiline string to a trimmed, non-empty list. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-small text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";
const areaCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-small text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";
const labelCls = "text-small font-medium text-foreground";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      {children}
      {hint ? <span className="text-caption text-subtle">{hint}</span> : null}
    </label>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-h6 font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-caption text-subtle">{description}</p> : null}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function ProductForm({
  initial,
  library = [],
}: {
  initial?: AdminProduct;
  library?: MediaDTO[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [mediaItems, setMediaItems] = useState<MediaDTO[]>(library);
  const onUploaded = (assets: MediaDTO[]) =>
    setMediaItems((prev) => [...assets, ...prev]);

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [categoryKey, setCategoryKey] = useState(initial?.categoryKey ?? "mobile");
  const [status, setStatus] = useState(initial?.status ?? "DRAFT");
  const [availability, setAvailability] = useState(initial?.availability ?? "in-stock");
  const [badge, setBadge] = useState<string>(initial?.badge ?? "");
  const [featured, setFeatured] = useState(initial?.featured ?? false);

  const [image, setImage] = useState(initial?.image ?? "");
  const [gallery, setGallery] = useState<string[]>(initial?.gallery ?? []);

  const [short, setShort] = useState<LangText>(initial?.shortDescription ?? emptyText());
  const [desc, setDesc] = useState<LangText>(initial?.description ?? emptyText());
  const [featuresText, setFeaturesText] = useState<LangText>({
    en: (initial?.features.en ?? []).join("\n"),
    tr: (initial?.features.tr ?? []).join("\n"),
    de: (initial?.features.de ?? []).join("\n"),
  });
  const [useCasesText, setUseCasesText] = useState<LangText>({
    en: (initial?.useCases.en ?? []).join("\n"),
    tr: (initial?.useCases.tr ?? []).join("\n"),
    de: (initial?.useCases.de ?? []).join("\n"),
  });

  const [specs, setSpecs] = useState<SpecRow[]>(
    initial?.specs.map((s) => ({ label: { ...s.label }, value: s.value })) ?? [],
  );
  const [markets, setMarkets] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const f of MARKETPLACE_FIELDS) m[f.value] = initial?.marketplaces[f.value] ?? "";
    return m;
  });

  const [lang, setLang] = useState<Locale>("tr");

  // Auto-derive slug from name until the user edits it manually.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const payload = useMemo(() => {
    const marketplaces: Record<string, string> = {};
    for (const f of MARKETPLACE_FIELDS) {
      const v = markets[f.value]?.trim();
      if (v) marketplaces[f.value] = v;
    }
    return JSON.stringify({
      slug: slug.trim(),
      name: name.trim(),
      categoryKey,
      status,
      featured,
      availability,
      badge: badge ? badge : null,
      image: image.trim() ? image.trim() : null,
      gallery,
      shortDescription: short,
      description: desc,
      features: { en: lines(featuresText.en), tr: lines(featuresText.tr), de: lines(featuresText.de) },
      useCases: { en: lines(useCasesText.en), tr: lines(useCasesText.tr), de: lines(useCasesText.de) },
      specs: specs
        .filter((s) => s.value.trim())
        .map((s) => ({ label: s.label, value: s.value.trim() })),
      marketplaces,
      downloads: initial?.downloads ?? [],
    });
  }, [
    slug, name, categoryKey, status, featured, availability, badge, image,
    gallery, short, desc, featuresText, useCasesText, specs, markets, initial,
  ]);

  const [state, formAction, isPending] = useActionState<ProductFormState, FormData>(
    saveProductAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.push("/admin/products");
  }, [state.ok, router]);

  const setLangField = (
    setter: React.Dispatch<React.SetStateAction<LangText>>,
    value: string,
  ) => setter((prev) => ({ ...prev, [lang]: value }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Temel bilgiler">
            <Field label="Ürün adı" hint="Marka/ürün adı — tüm dillerde aynı görünür.">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="URL adı (slug)" hint="Sitedeki adres: /products/…">
              <input
                className={inputCls}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategori">
                <select className={inputCls} value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Stok durumu">
                <select className={inputCls} value={availability} onChange={(e) => setAvailability(e.target.value as AdminProduct["availability"])}>
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          {/* Localized content */}
          <Card title="İçerik (çok dilli)" description="Her dili ayrı ayrı doldurun. Sekmeyle dil değiştirin.">
            <div className="flex gap-1 rounded-lg border border-border bg-surface-sunken p-1">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={
                    "flex-1 rounded-md px-3 py-1.5 text-small font-medium transition-colors " +
                    (lang === l.code ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>

            <Field label="Kısa açıklama" hint="Kartlarda ve ürün üstünde görünen tek cümle.">
              <textarea rows={2} className={areaCls} value={short[lang]} onChange={(e) => setLangField(setShort, e.target.value)} />
            </Field>
            <Field label="Açıklama">
              <textarea rows={5} className={areaCls} value={desc[lang]} onChange={(e) => setLangField(setDesc, e.target.value)} />
            </Field>
            <Field label="Öne çıkan özellikler" hint="Her satıra bir madde yazın.">
              <textarea rows={4} className={areaCls} value={featuresText[lang]} onChange={(e) => setLangField(setFeaturesText, e.target.value)} />
            </Field>
            <Field label="Kullanım alanları" hint="Her satıra bir madde yazın.">
              <textarea rows={3} className={areaCls} value={useCasesText[lang]} onChange={(e) => setLangField(setUseCasesText, e.target.value)} />
            </Field>
          </Card>

          {/* Specs */}
          <Card title="Teknik özellikler" description={`Etiketler seçili dilde (${LOCALES.find((l) => l.code === lang)?.label}) düzenlenir. Değer tüm dillerde ortaktır.`}>
            {specs.length === 0 ? (
              <p className="text-small text-subtle">Henüz özellik eklenmedi.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {specs.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      placeholder="Etiket (örn. Güç çıkışı)"
                      value={row.label[lang]}
                      onChange={(e) =>
                        setSpecs((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, label: { ...r.label, [lang]: e.target.value } } : r)),
                        )
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Değer (örn. 140 W)"
                      value={row.value}
                      onChange={(e) =>
                        setSpecs((prev) => prev.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setSpecs((prev) => prev.filter((_, j) => j !== i))}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-[#e0b4b4] hover:text-[#8a2b2b]"
                      aria-label="Özelliği sil"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSpecs((prev) => [...prev, { label: emptyText(), value: "" }])}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-small font-medium text-foreground transition-colors hover:border-accent/50"
            >
              <Plus className="size-4" aria-hidden="true" /> Özellik ekle
            </button>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card title="Yayın">
            <Field label="Durum" hint="Yalnızca “Yayında” ürünler sitede görünür.">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as AdminProduct["status"])}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Rozet">
              <select className={inputCls} value={badge} onChange={(e) => setBadge(e.target.value)}>
                {BADGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="size-4 rounded border-border accent-navy-950" />
              <span className="text-small text-foreground">Öne çıkanlarda göster</span>
            </label>
          </Card>

          <Card title="Görseller" description="Bilgisayarınızdan yükleyin veya kütüphaneden seçin.">
            <Field label="Ana görsel" hint="Boş bırakılırsa marka görseli kullanılır.">
              <SingleImagePicker
                value={image}
                onChange={setImage}
                library={mediaItems}
                onUploaded={onUploaded}
              />
            </Field>
            <Field label="Galeri görselleri" hint="Ürün detayında ana görselin yanında gösterilir.">
              <GalleryPicker
                value={gallery}
                onChange={setGallery}
                library={mediaItems}
                onUploaded={onUploaded}
              />
            </Field>
          </Card>

          <Card title="Pazar yerleri" description="Dolu olan kanallar ürün sayfasında “Satın al” butonu olur.">
            {MARKETPLACE_FIELDS.map((f) => (
              <Field key={f.value} label={f.label}>
                <input
                  className={inputCls}
                  value={markets[f.value] ?? ""}
                  onChange={(e) => setMarkets((prev) => ({ ...prev, [f.value]: e.target.value }))}
                  placeholder="https://…"
                />
              </Field>
            ))}
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-surface/80 px-4 py-4 backdrop-blur">
        <Link
          href="/admin/products"
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-small font-medium text-foreground transition-colors hover:border-accent/50"
        >
          Vazgeç
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-5 text-small font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isEdit ? "Değişiklikleri kaydet" : "Ürünü oluştur"}
        </button>
      </div>
    </form>
  );
}
