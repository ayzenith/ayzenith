import { CURRENCIES, UNITS } from "@/config/os";
import { Card, Field, Note, btn, input } from "./ui";

/**
 * The traded-good form.
 *
 * Two prices, each with its own currency, because buying in EUR and selling in
 * TRY is the normal case here and a single "currency" field would force one of
 * the two numbers to be a lie. The purchase price entered here is only a
 * REFERENCE — the cost that drives margin is computed from what was actually
 * paid, including freight and customs, when a purchase is confirmed.
 */

export type ItemFormValues = {
  id?: string;
  sku?: string;
  name?: string;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  unit?: string;
  purchasePrice?: number | null;
  purchaseCurrency?: string;
  salePrice?: number | null;
  saleCurrency?: string;
  vatRate?: number | null;
  minStock?: number | null;
  description?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function ItemForm({
  action,
  values = {},
  submitLabel,
  cancelHref,
  categories = [],
}: {
  action: (fd: FormData) => Promise<void>;
  values?: ItemFormValues;
  submitLabel: string;
  cancelHref: string;
  categories?: string[];
}) {
  const isEdit = Boolean(values.id);
  return (
    <form action={action} className="flex flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Card title="Ürün">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stok kodu (SKU)" required hint="Benzersiz olmalı. Excel içe aktarmada eşleştirme buradan yapılır.">
            <input name="sku" defaultValue={values.sku ?? ""} required className={input} placeholder="TSH-001" />
          </Field>
          <Field label="Barkod">
            <input name="barcode" defaultValue={values.barcode ?? ""} className={input} />
          </Field>
          <Field label="Ürün adı" required className="sm:col-span-2">
            <input name="name" defaultValue={values.name ?? ""} required className={input} placeholder="Pamuklu T-shirt" />
          </Field>
          <Field label="Kategori">
            <input name="category" defaultValue={values.category ?? ""} list="os-categories" className={input} />
            <datalist id="os-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Marka">
            <input name="brand" defaultValue={values.brand ?? ""} className={input} />
          </Field>
          <Field label="Birim">
            <input name="unit" defaultValue={values.unit ?? "adet"} list="os-units" className={input} />
            <datalist id="os-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Minimum stok" hint="Bu seviyenin altına düşünce kokpitte uyarı çıkar.">
            <input name="minStock" type="text" inputMode="decimal" defaultValue={values.minStock ?? ""} className={input} />
          </Field>
        </div>
      </Card>

      <Card title="Fiyat">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alış fiyatı" hint="Referans. Gerçek maliyet alış belgelerinden hesaplanır.">
            <input name="purchasePrice" type="text" inputMode="decimal" defaultValue={values.purchasePrice ?? ""} className={input} />
          </Field>
          <Field label="Alış para birimi">
            <select name="purchaseCurrency" defaultValue={values.purchaseCurrency ?? "TRY"} className={input}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Satış fiyatı">
            <input name="salePrice" type="text" inputMode="decimal" defaultValue={values.salePrice ?? ""} className={input} />
          </Field>
          <Field label="Satış para birimi">
            <select name="saleCurrency" defaultValue={values.saleCurrency ?? "TRY"} className={input}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="KDV %" hint="Sadece belgeye yazılır; vergi hesaplanmaz.">
            <input name="vatRate" type="text" inputMode="decimal" defaultValue={values.vatRate ?? ""} className={input} placeholder="20" />
          </Field>
          {isEdit ? (
            <Field label="Durum">
              <select name="active" defaultValue={values.active === false ? "false" : "true"} className={input}>
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </select>
            </Field>
          ) : null}
        </div>
        {isEdit ? null : (
          <div className="mt-4">
            <Note>
              Kanal bazlı fiyatları (Trendyol, Amazon, web, B2B) ürünü kaydettikten sonra ürün
              kartından ekleyebilirsin.
            </Note>
          </div>
        )}
      </Card>

      <Card title="Açıklama">
        <div className="grid gap-4">
          <Field label="Açıklama">
            <textarea name="description" defaultValue={values.description ?? ""} rows={3} className={input} />
          </Field>
          <Field label="İç not">
            <textarea name="notes" defaultValue={values.notes ?? ""} rows={2} className={input} />
          </Field>
        </div>
      </Card>

      <div className="flex gap-2">
        <button type="submit" className={btn.primary}>
          {submitLabel}
        </button>
        <a href={cancelHref} className={btn.secondary}>
          Vazgeç
        </a>
      </div>
    </form>
  );
}
