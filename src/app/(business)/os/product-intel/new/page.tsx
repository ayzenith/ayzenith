import type { Metadata } from "next";

import { DEFAULT_RETURN_RATE_PCT, DEFAULT_TARGET_MARGIN_PCT, MARKETPLACES } from "@/config/product-intel";
import { getOsSettings } from "@/server/os/settings";
import { getFormOptions } from "@/server/product-intel/repo";
import { ProductInput } from "@/components/os/product-intel/product-input";
import { Card, Field, Note, PageHead, btn, input } from "@/components/os/ui";
import { analyzeProductAction } from "../actions";

export const metadata: Metadata = { title: "Yeni ürün analizi · Business OS" };
export const dynamic = "force-dynamic";
// Reading a page or two and two AI calls; the ceiling matches Lead Finder's.
export const maxDuration = 300;

export default async function NewProductAnalysis() {
  const [options, settings] = await Promise.all([getFormOptions(), getOsSettings()]);

  return (
    <>
      <PageHead
        title="Yeni ürün analizi"
        description="Ürünü tarif et, rakip verisini ver, maliyetini bağla. Sistem yalnızca ölçebildiği şeyleri söyler."
        back={{ href: "/os/product-intel", label: "Ürün Analizi" }}
      />

      <form action={analyzeProductAction} className="grid gap-5">
        <Card title="1. Ürün" description="Özellikler okunduğu anda aşağıda görünür — göremediğin bir özellik analize girmez.">
          <ProductInput />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Model">
              <input name="model" className={input} />
            </Field>
            <Field label="Üretici parça no (MPN)">
              <input name="mpn" className={input} />
            </Field>
            <Field label="Barkod (EAN/GTIN)">
              <input name="ean" className={input} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Kendi ürün sayfan (opsiyonel)" hint="Tedarikçi veya üretici sayfası — okunup özelliklere eklenir.">
              <input name="productUrl" type="url" className={input} placeholder="https://..." />
            </Field>
          </div>
        </Card>

        <Card title="2. Hedef pazar">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pazaryeri" required>
              <select name="marketplace" className={input} defaultValue="TRENDYOL">
                {MARKETPLACES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} (başlık sınırı {m.titleMaxChars})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ülke">
              <input name="marketCountry" className={input} defaultValue="TR" />
            </Field>
            <Field label="Kanal" hint="Komisyon oranı buradan alınır.">
              <select name="channelId" className={input} defaultValue="">
                <option value="">Seçilmedi</option>
                {options.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.commissionRate != null ? ` — %${c.commissionRate}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card
          title="3. Rakip verisi"
          description="Bu sürümde pazaryeri otomatik taranmaz. Listeyi yapıştır, dosya yükle veya tek tek adres ver."
        >
          <div className="grid gap-4">
            <Field
              label="Rakip listesi (yapıştır)"
              hint="Excel'den kopyalayıp yapıştırabilirsin. Başlık satırı varsa tanınır: başlık, fiyat, satıcı, marka, puan, yorum."
            >
              <textarea
                name="competitorBlock"
                rows={8}
                className={`${input} font-mono text-caption`}
                placeholder={"Başlık\tFiyat\tSatıcı\tMarka\tPuan\tYorum\nŞarjlı Mini Fan USB 2000mAh\t249,90\tABC Mağaza\tNoName\t4,3\t512"}
              />
            </Field>
            <Field label="veya dosya yükle" hint="Excel (.xlsx) ya da CSV. Yapıştırılan metinle birlikte kullanılabilir.">
              <input name="competitorFile" type="file" accept=".xlsx,.csv,.tsv,.txt" className={input} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rakip ürün adresi 1">
                <input name="competitorUrl1" type="url" className={input} placeholder="https://..." />
              </Field>
              <Field label="Rakip ürün adresi 2">
                <input name="competitorUrl2" type="url" className={input} placeholder="https://..." />
              </Field>
              <Field label="Rakip ürün adresi 3">
                <input name="competitorUrl3" type="url" className={input} placeholder="https://..." />
              </Field>
            </div>
            <Note>
              Bir adres okunamazsa (site otomatik istemcileri geri çeviriyorsa) analiz durmaz — Kaynaklar sekmesinde
              nedeniyle birlikte kaydedilir. &quot;Veri alınamadı&quot; ile &quot;pazarda yok&quot; burada asla karıştırılmaz.
            </Note>
          </div>
        </Card>

        <Card
          title="4. Maliyet ve fiyat"
          description="Maliyet sırayla aranır: ürünün hareketli ortalama maliyeti → ithalat iniş maliyeti → senin girdiğin varsayım. Hiçbiri yoksa fiyat hesaplanmaz, uydurulmaz."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ürün (stoktaki SKU)" hint="Seçilirse gerçek ortalama maliyet kullanılır.">
              <select name="itemId" className={input} defaultValue="">
                <option value="">Seçilmedi</option>
                {options.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                    {i.hasAverageCost ? " ✓ maliyet var" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="İthalat analizi" hint="Henüz alınmamış ürün için iniş maliyeti kaynağı.">
              <select name="importCaseId" className={input} defaultValue="">
                <option value="">Seçilmedi</option>
                {options.importCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={`Hedef alış maliyeti (${settings.baseCurrency})`} hint="Yalnızca yukarıdakiler yoksa kullanılır ve VARSAYIM olarak işaretlenir.">
              <input name="userUnitCost" inputMode="decimal" className={input} placeholder="0,00" />
            </Field>
            <Field label={`Kargo (${settings.baseCurrency}/adet)`}>
              <input name="shipping" inputMode="decimal" className={input} defaultValue="0" />
            </Field>
            <Field label={`Paketleme (${settings.baseCurrency}/adet)`}>
              <input name="packaging" inputMode="decimal" className={input} defaultValue="0" />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label="İade oranı (%)" hint="Kargo gidiş-dönüş + paketleme karşılığı.">
              <input name="returnRatePct" inputMode="decimal" className={input} defaultValue={String(DEFAULT_RETURN_RATE_PCT)} />
            </Field>
            <Field label="KDV (%)" hint="Boş bırakılırsa ürünün KDV'si, o da yoksa %20.">
              <input name="vatRatePct" inputMode="decimal" className={input} placeholder="20" />
            </Field>
            <Field label="Komisyon (%)" hint="Boş bırakılırsa seçilen kanalın oranı.">
              <input name="commissionPct" inputMode="decimal" className={input} placeholder="—" />
            </Field>
            <Field label="Hedef marj (%)" hint="KDV hariç net gelire oranla.">
              <input name="targetMarginPct" inputMode="decimal" className={input} defaultValue={String(DEFAULT_TARGET_MARGIN_PCT)} />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <button type="submit" className={btn.primary}>
            Analizi çalıştır
          </button>
        </div>
      </form>
    </>
  );
}
