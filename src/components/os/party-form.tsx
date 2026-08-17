import { CURRENCIES, PARTY_ROLE_LABELS, PARTY_ROLE_ORDER } from "@/config/os";
import { Card, Field, btn, input } from "./ui";

/**
 * The firm form, shared by create and edit.
 *
 * Only ONE field is required. A firm you have just met is a name and nothing
 * else, and a form that demands a tax number before it will save is a form that
 * gets bypassed with a spreadsheet. Everything else is filled in as it becomes
 * known — which is why the roles are checkboxes rather than a single "type":
 * the same company being a customer AND a supplier is the normal case, not an
 * edge case.
 */

export type PartyFormValues = {
  id?: string;
  name?: string;
  legalName?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  country?: string;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string;
  paymentTermDays?: number | null;
  notes?: string | null;
  active?: boolean;
  roles?: string[];
};

export function PartyForm({
  action,
  values = {},
  submitLabel,
  cancelHref,
  defaultCountry = "TR",
}: {
  action: (fd: FormData) => Promise<void>;
  values?: PartyFormValues;
  submitLabel: string;
  cancelHref: string;
  defaultCountry?: string;
}) {
  const roles = new Set(values.roles ?? []);
  const isEdit = Boolean(values.id);

  return (
    <form action={action} className="flex flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Card title="Firma bilgileri">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firma adı" required className="sm:col-span-2">
            <input name="name" defaultValue={values.name ?? ""} required autoFocus className={input} placeholder="ABC GmbH" />
          </Field>
          <Field label="Resmi unvan" className="sm:col-span-2">
            <input name="legalName" defaultValue={values.legalName ?? ""} className={input} placeholder="ABC Handels GmbH" />
          </Field>
          <Field label="Vergi no">
            <input name="taxNumber" defaultValue={values.taxNumber ?? ""} className={input} />
          </Field>
          <Field label="Vergi dairesi">
            <input name="taxOffice" defaultValue={values.taxOffice ?? ""} className={input} />
          </Field>
        </div>
      </Card>

      {!isEdit ? (
        <Card title="Ticari ilişki" description="Aynı firma birden fazla rolde olabilir — ikinci bir kayıt açma.">
          <div className="grid gap-2 sm:grid-cols-3">
            {PARTY_ROLE_ORDER.map((role) => (
              <label key={role} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-small">
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  defaultChecked={roles.has(role)}
                  className="size-4 rounded border-border"
                />
                {PARTY_ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="İletişim ve adres">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ülke" hint="İki harfli kod: TR, DE, AE">
            <input
              name="country"
              defaultValue={values.country ?? defaultCountry}
              maxLength={2}
              className={`${input} uppercase`}
            />
          </Field>
          <Field label="Şehir">
            <input name="city" defaultValue={values.city ?? ""} className={input} />
          </Field>
          <Field label="Adres" className="sm:col-span-2">
            <input name="address" defaultValue={values.address ?? ""} className={input} />
          </Field>
          <Field label="Posta kodu">
            <input name="postalCode" defaultValue={values.postalCode ?? ""} className={input} />
          </Field>
          <Field label="Telefon">
            <input name="phone" defaultValue={values.phone ?? ""} className={input} />
          </Field>
          <Field label="E-posta">
            <input name="email" type="email" defaultValue={values.email ?? ""} className={input} />
          </Field>
          <Field label="Web sitesi">
            <input name="website" defaultValue={values.website ?? ""} className={input} placeholder="https://" />
          </Field>
        </div>
      </Card>

      <Card title="Ticari koşullar">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Para birimi" hint="Yeni belgelerde varsayılan olarak gelir.">
            <select name="currency" defaultValue={values.currency ?? "TRY"} className={input}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vade (gün)" hint="Belgede tarih girilmezse vade buradan hesaplanır.">
            <input
              name="paymentTermDays"
              type="number"
              min={0}
              defaultValue={values.paymentTermDays ?? ""}
              className={input}
              placeholder="30"
            />
          </Field>
          <Field label="Not" className="sm:col-span-2">
            <textarea name="notes" defaultValue={values.notes ?? ""} rows={3} className={input} />
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
