import type { Metadata } from "next";
import Link from "next/link";
import { listParties } from "@/server/os/parties";
import { listItems } from "@/server/os/items";
import { getOsSettings } from "@/server/os/settings";
import { istanbulDay } from "@/server/os/fx-tcmb";
import { listImportCases, nomenclatureMeta } from "@/server/import/repo";
import { COUNTRY_OPTIONS, ORIGIN_PROOF_LABELS } from "@/server/import/origin";
import { formatGtip } from "@/server/import/text";
import { countryName } from "@/server/import/countries";
import { CURRENCIES } from "@/config/os";
import { Badge, Card, DateText, EmptyState, Field, Note, PageHead, Pagination, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";
import { analyzeImportAction } from "./actions";

export const metadata: Metadata = { title: "İthalat · Business OS" };
export const dynamic = "force-dynamic";

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

export default async function ImportIntelligence({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const [suppliers, items, settings, cases, nomenclature] = await Promise.all([
    listParties({ role: "SUPPLIER", perPage: 200 }),
    listItems({ perPage: 300, active: true }),
    getOsSettings(),
    listImportCases({ page }),
    nomenclatureMeta(),
  ]);
  const today = istanbulDay();

  return (
    <>
      <PageHead
        title="İthalat Intelligence"
        description="Bir ürünü Türkiye'ye ithal ederken: GTİP tahmini (kanıtlı), ithalat vergileri, ürün denetimleri, lojistik ve gerçek iniş maliyeti — hepsi kaynağıyla."
        actions={<Link href="/os/import/sources" className={btn.secondary}>Kaynaklar</Link>}
      />

      {!nomenclature.trSource ? (
        <div className="mb-4">
          <Note tone="warning">
            Türk Gümrük Tarife Cetveli sisteme yüklenmemiş — GTİP tahmini yapılamaz. Kaynak yükleme:{" "}
            <code>npx tsx scripts/import-intelligence/ingest.ts</code>
          </Note>
        </div>
      ) : (
        <div className="mb-4">
          <Note>
            Yüklü tarife cetveli: <b>{nomenclature.trSource.name}</b> · {nomenclature.trLineCount.toLocaleString("tr-TR")} satır · kaynak tarihi{" "}
            {nomenclature.trSource.fetchedAt?.slice(0, 10)}. GTİP tahmini bir <b>model tahminidir</b>, resmi/bağlayıcı sınıflandırma değildir.
          </Note>
        </div>
      )}

      <form action={analyzeImportAction} className="space-y-4">
        <Card title="1 · Ürün" description="Ne kadar çok teknik bilgi verirsen tahmin o kadar güvenilir olur; eksik bilgi 'VERİ YETERSİZ' olarak gösterilir.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Ürün adı" required className="lg:col-span-2">
              <input name="productName" required className={input} placeholder="Bluetooth kulaklık" />
            </Field>
            <Field label="Marka">
              <input name="brand" className={input} placeholder="Sony" />
            </Field>
            <Field label="Model">
              <input name="model" className={input} placeholder="WH-1000XM5" />
            </Field>
            <Field label="Üretici parça no (MPN)">
              <input name="mpn" className={input} />
            </Field>
            <Field label="EAN / GTIN" hint="Kontrol hanesi doğrulanır">
              <input name="ean" className={input} inputMode="numeric" />
            </Field>
            <Field label="Ürün durumu">
              <select name="condition" defaultValue="NEW" className={input}>
                <option value="NEW">Yeni</option>
                <option value="USED">Kullanılmış / ikinci el</option>
                <option value="REFURBISHED">Yenilenmiş</option>
              </select>
            </Field>
            <Field label="Business OS ürünü" hint="Varsa bağla">
              <select name="itemId" defaultValue="" className={input}>
                <option value="">— seçilmedi —</option>
                {items.rows.map((i) => (
                  <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Ürün açıklaması" className="sm:col-span-2 lg:col-span-4">
              <textarea name="description" rows={2} className={input} placeholder="Kablosuz kulak üstü kulaklık, Bluetooth 5.2, mikrofonlu, 30 saat pil…" />
            </Field>
            <Field label="Teknik özellikler / datasheet metni" hint="Datasheet'i buraya yapıştırabilirsin" className="sm:col-span-2 lg:col-span-4">
              <textarea name="specText" rows={3} className={input} />
            </Field>
            <Field label="Ürün sayfası / datasheet bağlantısı 1" hint="Üretici sayfası tercih edilir" className="lg:col-span-2">
              <input name="url1" className={input} placeholder="https://" />
            </Field>
            <Field label="Bağlantı 2">
              <input name="url2" className={input} placeholder="https://" />
            </Field>
            <Field label="Bağlantı 3">
              <input name="url3" className={input} placeholder="https://" />
            </Field>
          </div>
        </Card>

        <Card title="2 · GTİP" description="Bilmiyorsan sistem tahmin eder ve tahmini neye dayandırdığını gösterir. Biliyorsan girdiğin kodu resmi cetvelle karşılaştırır.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mod">
              <select name="gtipMode" defaultValue="PREDICT" className={input}>
                <option value="PREDICT">GTİP&apos;i bilmiyorum — tahmin et</option>
                <option value="USER">GTİP&apos;i biliyorum — kontrol et</option>
              </select>
            </Field>
            <Field label="GTİP (12 hane)" hint="Yalnız 'biliyorum' modunda kullanılır">
              <input name="userGtip" className={input} placeholder="8518.30.00.90.00" />
            </Field>
            <Field label="BTB (Bağlayıcı Tarife Bilgisi) no" hint="Varsa; sistem doğrulamaz, beyan olarak saklanır" className="lg:col-span-2">
              <input name="btbRef" className={input} />
            </Field>
          </div>
        </Card>

        <Card title="3 · Menşe, çıkış ve belgeler" description="Menşe ile çıkış ülkesi ayrı alanlardır. A.TR menşe belgesi değildir; AB'de serbest dolaşımı gösterir.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Menşe ülkesi" hint="Ürünün üretildiği ülke">
              <select name="originCountry" defaultValue="" className={input}>
                <option value="">— girilmedi —</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.iso} value={c.iso}>{c.tr}</option>
                ))}
              </select>
            </Field>
            <Field label="Çıkış (sevk) ülkesi">
              <select name="dispatchCountry" defaultValue="" className={input}>
                <option value="">— girilmedi —</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.iso} value={c.iso}>{c.tr}</option>
                ))}
              </select>
            </Field>
            <Field label="A.TR dolaşım belgesi">
              <select name="atr" defaultValue="" className={input}>
                <option value="">— belirtilmedi —</option>
                <option value="YES">Var</option>
                <option value="NO">Yok</option>
              </select>
            </Field>
            <Field label="Menşe ispat belgesi">
              <select name="originProof" defaultValue="NONE" className={input}>
                {Object.entries(ORIGIN_PROOF_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Tedarikçi">
              <select name="supplierId" defaultValue="" className={input}>
                <option value="">— seçilmedi —</option>
                {suppliers.rows.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="İthalat tarihi" hint="Vergiler bu tarihte yürürlükteki kurallara göre">
              <input type="date" name="importDate" defaultValue={today} className={input} />
            </Field>
          </div>
        </Card>

        <Card title="4 · Ticari bilgiler">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Miktar" required>
              <input name="quantity" inputMode="decimal" required className={input} placeholder="100" />
            </Field>
            <Field label="Birim">
              <input name="unit" defaultValue="adet" className={input} />
            </Field>
            <Field label="Birim fiyat" required>
              <input name="unitPrice" inputMode="decimal" required className={input} />
            </Field>
            <Field label="Para birimi">
              <select name="currency" defaultValue="EUR" className={input}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Teslim şekli (Incoterm)" hint="Navlun/sigortanın fiyata dahil olup olmadığını belirler">
              <select name="incoterm" defaultValue="" className={input}>
                <option value="">— girilmedi —</option>
                {INCOTERMS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label="Planlanan satış fiyatı (birim)" hint="Marj için">
              <input name="salePrice" inputMode="decimal" className={input} />
            </Field>
            <Field label="Satış para birimi">
              <select name="salePriceCurrency" defaultValue={settings.baseCurrency} className={input}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="5 · Taşıma ve maliyetler" description="Bilinmeyen maliyet uydurulmaz: girilmeyen kalem 'VERİ YETERSİZ' olarak görünür ve toplam eksik sayılır.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Çıkış şehri" hint="Lojistik sorgusu için">
              <input name="dispatchCity" className={input} placeholder="München" />
            </Field>
            <Field label="Varış şehri">
              <input name="destCity" defaultValue="Istanbul" className={input} />
            </Field>
            <Field label="Taşıma tipi">
              <select name="shipmentType" defaultValue="LTL" className={input}>
                <option value="LTL">Parsiyel (LTL)</option>
                <option value="FTL">Komple (FTL)</option>
              </select>
            </Field>
            <Field label="Palet / koli adedi">
              <input name="pallets" inputMode="numeric" className={input} />
            </Field>
            <Field label="Brüt ağırlık (kg)">
              <input name="weightKg" inputMode="decimal" className={input} />
            </Field>
            <Field label="Hacim (m³)">
              <input name="volumeM3" inputMode="decimal" className={input} />
            </Field>
            <Field label="Navlun">
              <input name="freight" inputMode="decimal" className={input} />
            </Field>
            <Field label="Navlun para birimi">
              <select name="freightCurrency" defaultValue="EUR" className={input}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Sigorta">
              <input name="insurance" inputMode="decimal" className={input} />
            </Field>
            <Field label="Sigorta para birimi">
              <select name="insuranceCurrency" defaultValue="EUR" className={input}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Gümrük müşaviri">
              <input name="broker" inputMode="decimal" className={input} />
            </Field>
            <Field label="Liman / ardiye / elleçleme">
              <input name="handling" inputMode="decimal" className={input} />
            </Field>
            <Field label="Diğer masraflar" hint="Boş bırakılırsa 0 kabul edilir">
              <input name="other" inputMode="decimal" className={input} />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className={btn.primary}>Analiz et</button>
            <span className="text-caption text-subtle">Analiz birkaç saniye sürer; resmi kaynaklar taranır ve sonuç kaydedilir.</span>
          </div>
        </Card>
      </form>

      <Card className="mt-6" title="Önceki analizler" padded={false}>
        {cases.rows.length === 0 ? (
          <EmptyState title="Henüz analiz yok" description="Yukarıdaki formu doldurup ilk ithalat analizini oluştur." />
        ) : (
          <>
            <Table stacked>
              <thead>
                <tr>
                  <Th>Kod</Th>
                  <Th>Ürün</Th>
                  <Th>GTİP</Th>
                  <Th>Durum</Th>
                  <Th>Menşe / çıkış</Th>
                  <Th>Tarih</Th>
                  <Th>Alış</Th>
                </tr>
              </thead>
              <tbody>
                {cases.rows.map((c) => (
                  <Tr key={c.id}>
                    <Td label="Kod"><Link href={`/os/import/${c.id}`} className="font-medium underline">{c.code}</Link></Td>
                    <Td label="Ürün">{c.productName}</Td>
                    <Td label="GTİP">{c.userGtip ?? c.predictedGtip ? formatGtip((c.userGtip ?? c.predictedGtip)!) : "—"}</Td>
                    <Td label="Durum">
                      <Badge tone={c.classificationStatus === "AI_PREDICTED" ? "warning" : c.classificationStatus === "INSUFFICIENT" ? "danger" : "info"}>
                        {c.classificationStatus === "AI_PREDICTED" ? `AI tahmini${c.candidates[0] ? ` %${Number(c.candidates[0].confidencePct)}` : ""}` : c.classificationStatus === "USER_ENTERED" ? "Kullanıcı girdisi" : c.classificationStatus === "BTB_DECLARED" ? "BTB beyanı" : "Veri yetersiz"}
                      </Badge>
                    </Td>
                    <Td label="Menşe / çıkış">{c.originCountry ? countryName(c.originCountry) : "—"} / {c.dispatchCountry ? countryName(c.dispatchCountry) : "—"}</Td>
                    <Td label="Tarih"><DateText value={c.importDate} /></Td>
                    <Td label="Alış">{c.purchaseId ? <Link href={`/os/purchases/${c.purchaseId}`} className="underline">alış kaydı</Link> : "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={cases.page} perPage={cases.perPage} total={cases.total} baseHref="/os/import" />
          </>
        )}
      </Card>
    </>
  );
}
