import type { Metadata } from "next";
import { getOsSettings } from "@/server/os/settings";
import { listSignatories } from "@/server/os/signatories";
import { listBankAccounts } from "@/server/os/bank-accounts";
import { CURRENCIES } from "@/config/os";
import { LANGUAGES, LANGUAGE_LABELS } from "@/config/trade-documents";
import {
  saveSettingsAction, seedChannelsAction, saveCompanyProfileAction,
  addSignatoryAction, updateSignatoryAction, deleteSignatoryAction, seedSignatoryAction,
  addBankAccountAction, updateBankAccountAction, deleteBankAccountAction,
} from "./actions";
import { Badge, Card, Field, Note, PageHead, Tabs, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Ayarlar · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ tab?: string }>;

const TABS = [
  { key: "genel", label: "Genel" },
  { key: "firma", label: "Firma Profili" },
  { key: "banka", label: "Banka Hesapları" },
  { key: "imza", label: "Yetkili İmzalar" },
];

export default async function Settings({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : "genel";
  const [s, signatories, bankAccounts] = await Promise.all([
    getOsSettings(),
    listSignatories(),
    listBankAccounts(),
  ]);

  return (
    <>
      <PageHead title="Ayarlar" />
      <Tabs items={TABS.map((t) => ({ label: t.label, href: `/os/settings?tab=${t.key}` }))} current={`/os/settings?tab=${tab}`} />

      {tab === "genel" ? (
        <>
          <form action={saveSettingsAction} className="flex flex-col gap-4">
            <Card title="Ticari ayarlar">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Ana para birimi">
                  <select name="baseCurrency" defaultValue={s.baseCurrency} className={input}>
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                  </select>
                </Field>
                <Field label="Varsayılan ülke" hint="İki harfli kod">
                  <input name="defaultCountry" defaultValue={s.defaultCountry} maxLength={2} className={`${input} uppercase`} />
                </Field>
                <Field label="Eksi stok">
                  <label className="flex h-[2.375rem] items-center gap-2.5 text-small">
                    <input type="checkbox" name="allowNegativeStock" defaultChecked={s.allowNegativeStock} className="size-4 rounded border-border" />
                    Eksi stoğa izin ver
                  </label>
                </Field>
              </div>
            </Card>

            <Card title="Kur tablosu" description="Yeni belgeler açılırken kur alanı buradan önerilir; kaydedilmiş belgeler kendi kurunu korur.">
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {CURRENCIES.filter((c) => c.code !== s.baseCurrency).map((c) => (
                  <Field key={c.code} label={`1 ${c.code} = ? ${s.baseCurrency}`}>
                    <input name={`fx_${c.code}`} defaultValue={s.fxRates[c.code] ?? ""} inputMode="decimal" className={input} placeholder="—" />
                  </Field>
                ))}
              </div>
              <Note tone="warning">Kur değişikliği sadece YENİ belgelerde kullanılır. Kaydedilmiş belgeler kendi kurunu korur.</Note>
            </Card>

            <div><button type="submit" className={btn.primary}>Ayarları kaydet</button></div>
          </form>

          <Card className="mt-4" title="Başlangıç kanalları" description="Trendyol, Amazon, Web, Mağaza, B2B, Manuel — henüz yoksa tek tıkla oluştur.">
            <form action={seedChannelsAction}><button type="submit" className={btn.secondary}>Başlangıç kanallarını oluştur</button></form>
          </Card>
        </>
      ) : null}

      {tab === "firma" ? (
        <form action={saveCompanyProfileAction} encType="multipart/form-data" className="flex flex-col gap-4">
          <Card title="Şirket bilgileri" description="Ticari belgelerde (teklif, proforma, fatura, çeki listesi) 'Gönderen' bölümünde kullanılır.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Yasal ünvan" required><input name="companyLegalName" defaultValue={s.company.companyLegalName ?? ""} className={input} /></Field>
              <Field label="Marka adı"><input name="companyTradingName" defaultValue={s.company.companyTradingName ?? ""} className={input} /></Field>
              <Field label="Adres" className="md:col-span-2"><input name="companyAddress" defaultValue={s.company.companyAddress ?? ""} className={input} /></Field>
              <Field label="Şehir"><input name="companyCity" defaultValue={s.company.companyCity ?? ""} className={input} /></Field>
              <Field label="Posta kodu"><input name="companyPostalCode" defaultValue={s.company.companyPostalCode ?? ""} className={input} /></Field>
              <Field label="Ülke"><input name="companyCountry" defaultValue={s.company.companyCountry ?? ""} className={input} /></Field>
              <Field label="Telefon"><input name="companyPhone" defaultValue={s.company.companyPhone ?? ""} className={input} /></Field>
              <Field label="E-posta"><input name="companyEmail" type="email" defaultValue={s.company.companyEmail ?? ""} className={input} /></Field>
              <Field label="Web sitesi"><input name="companyWebsite" defaultValue={s.company.companyWebsite ?? ""} className={input} /></Field>
              <Field label="Vergi no"><input name="companyTaxNumber" defaultValue={s.company.companyTaxNumber ?? ""} className={input} /></Field>
              <Field label="KDV / VAT no"><input name="companyVatNumber" defaultValue={s.company.companyVatNumber ?? ""} className={input} /></Field>
              <Field label="Ticaret sicil no"><input name="companyChamberReg" defaultValue={s.company.companyChamberReg ?? ""} className={input} /></Field>
            </div>
          </Card>

          <Card title="Logo">
            <div className="flex items-center gap-4">
              {s.company.companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.company.companyLogoUrl} alt="Logo" className="h-12 max-w-[160px] object-contain" />
              ) : (
                <span className="text-caption text-subtle">Logo yüklenmedi — belgede metin olarak &quot;{s.company.companyTradingName}&quot; kullanılır.</span>
              )}
              <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className={input} />
            </div>
          </Card>

          <Card title="Belge varsayılanları">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Varsayılan dil">
                <select name="defaultDocLanguage" defaultValue={s.company.defaultDocLanguage} className={input}>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
                </select>
              </Field>
              <Field label="Varsayılan alt bilgi notu"><input name="defaultDocFooterNote" defaultValue={s.company.defaultDocFooterNote ?? ""} className={input} /></Field>
            </div>
          </Card>

          <div><button type="submit" className={btn.primary}>Firma profilini kaydet</button></div>
        </form>
      ) : null}

      {tab === "banka" ? (
        <div className="flex flex-col gap-4">
          <Card title="Yeni banka hesabı">
            <form action={addBankAccountAction} className="grid gap-3 md:grid-cols-3">
              <input name="bankName" placeholder="Banka adı" required className={input} />
              <input name="accountHolder" placeholder="Hesap sahibi" required className={input} />
              <select name="currency" className={input} defaultValue="EUR">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              <input name="iban" placeholder="IBAN" className={input} />
              <input name="swift" placeholder="SWIFT / BIC" className={input} />
              <input name="country" placeholder="Ülke" className={input} />
              <label className="flex items-center gap-2 text-small"><input type="checkbox" name="isDefault" className="size-4 rounded border-border" /> Varsayılan</label>
              <button type="submit" className={`${btn.primary} md:col-span-3 md:w-fit`}>Ekle</button>
            </form>
          </Card>

          {bankAccounts.map((b) => (
            <Card key={b.id} title={`${b.bankName} — ${b.currency}`} actions={b.isDefault ? <Badge tone="accent">Varsayılan</Badge> : undefined}>
              <form action={updateBankAccountAction} className="grid gap-3 md:grid-cols-3">
                <input type="hidden" name="id" value={b.id} />
                <input name="bankName" defaultValue={b.bankName} className={input} />
                <input name="accountHolder" defaultValue={b.accountHolder} className={input} />
                <select name="currency" defaultValue={b.currency} className={input}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                <input name="iban" defaultValue={b.iban ?? ""} className={input} />
                <input name="swift" defaultValue={b.swift ?? ""} className={input} />
                <input name="country" defaultValue={b.country ?? ""} className={input} />
                <label className="flex items-center gap-2 text-small"><input type="checkbox" name="active" defaultChecked={b.active} className="size-4 rounded border-border" /> Aktif</label>
                <label className="flex items-center gap-2 text-small"><input type="checkbox" name="isDefault" defaultChecked={b.isDefault} className="size-4 rounded border-border" /> Varsayılan</label>
                <div className="flex gap-2 md:col-span-3">
                  <button type="submit" className={btn.secondary}>Kaydet</button>
                </div>
              </form>
              <form action={deleteBankAccountAction} className="mt-2">
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className={btn.danger}>Sil</button>
              </form>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "imza" ? (
        <div className="flex flex-col gap-4">
          {signatories.length === 0 ? (
            <Card title="Başlangıç kaydı">
              <form action={seedSignatoryAction}>
                <button type="submit" className={btn.secondary}>Ayaz Kaya — CEO &amp; Founder kaydını oluştur</button>
              </form>
            </Card>
          ) : null}

          <Card title="Yeni yetkili">
            <form action={addSignatoryAction} className="grid gap-3 md:grid-cols-3">
              <input name="firstName" placeholder="İsim" required className={input} />
              <input name="lastName" placeholder="Soyisim" className={input} />
              <input name="jobTitle" placeholder="Ünvan (CEO & Founder…)" className={input} />
              <input name="department" placeholder="Departman" className={input} />
              <input name="email" type="email" placeholder="E-posta" className={input} />
              <input name="phone" placeholder="Telefon" className={input} />
              <label className="flex items-center gap-2 text-small"><input type="checkbox" name="isDefault" className="size-4 rounded border-border" /> Varsayılan</label>
              <button type="submit" className={`${btn.primary} md:col-span-3 md:w-fit`}>Ekle</button>
            </form>
          </Card>

          {signatories.map((sig) => (
            <Card
              key={sig.id}
              title={[sig.firstName, sig.lastName].filter(Boolean).join(" ")}
              description={sig.jobTitle ?? undefined}
              actions={sig.isDefault ? <Badge tone="accent">Varsayılan</Badge> : undefined}
            >
              <form action={updateSignatoryAction} encType="multipart/form-data" className="grid gap-3 md:grid-cols-3">
                <input type="hidden" name="id" value={sig.id} />
                <input name="firstName" defaultValue={sig.firstName} className={input} />
                <input name="lastName" defaultValue={sig.lastName ?? ""} className={input} />
                <input name="jobTitle" defaultValue={sig.jobTitle ?? ""} className={input} />
                <input name="department" defaultValue={sig.department ?? ""} className={input} />
                <input name="email" defaultValue={sig.email ?? ""} className={input} />
                <input name="phone" defaultValue={sig.phone ?? ""} className={input} />
                <div className="flex items-center gap-3 md:col-span-3">
                  {sig.signatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sig.signatureUrl} alt="İmza" className="h-10 object-contain" />
                  ) : (
                    <span className="text-caption text-subtle">İmza görseli yok</span>
                  )}
                  <input type="file" name="signature" accept="image/png,image/jpeg,image/webp" className={input} />
                </div>
                <label className="flex items-center gap-2 text-small"><input type="checkbox" name="active" defaultChecked={sig.active} className="size-4 rounded border-border" /> Aktif</label>
                <label className="flex items-center gap-2 text-small"><input type="checkbox" name="isDefault" defaultChecked={sig.isDefault} className="size-4 rounded border-border" /> Varsayılan</label>
                <div className="flex gap-2 md:col-span-3">
                  <button type="submit" className={btn.secondary}>Kaydet</button>
                </div>
              </form>
              <form action={deleteSignatoryAction} className="mt-2">
                <input type="hidden" name="id" value={sig.id} />
                <button type="submit" className={btn.danger}>Sil</button>
              </form>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}
