import type { Metadata } from "next";
import { getOsSettings } from "@/server/os/settings";
import { CURRENCIES } from "@/config/os";
import { saveSettingsAction, seedChannelsAction } from "./actions";
import { Card, Field, Note, PageHead, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Ayarlar · Business OS" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const s = await getOsSettings();

  return (
    <>
      <PageHead title="Ayarlar" />

      <form action={saveSettingsAction} className="flex flex-col gap-4">
        <Card title="Ticari ayarlar">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Ana para birimi">
              <select name="baseCurrency" defaultValue={s.baseCurrency} className={input}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                ))}
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
          <Note tone="warning">
            Kur değişikliği sadece YENİ belgelerde kullanılır. Kaydedilmiş belgeler kendi kurunu korur.
          </Note>
        </Card>

        <div>
          <button type="submit" className={btn.primary}>Ayarları kaydet</button>
        </div>
      </form>

      <Card className="mt-4" title="Başlangıç kanalları" description="Trendyol, Amazon, Web, Mağaza, B2B, Manuel — henüz yoksa tek tıkla oluştur.">
        <form action={seedChannelsAction}>
          <button type="submit" className={btn.secondary}>Başlangıç kanallarını oluştur</button>
        </form>
      </Card>
    </>
  );
}
