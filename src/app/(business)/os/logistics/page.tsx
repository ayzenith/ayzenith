import type { Metadata } from "next";
import Link from "next/link";
import { listFreightCosts, resolveLogisticsQuery, type LogisticsQueryResult } from "@/server/logistics/query";
import { Badge, Card, DateText, Detail, EmptyState, Field, Money, Note, PageHead, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Lojistik · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

const MISSING = "VERİ YETERSİZ";
const REQUIRED = "[Gerekli]";

function str(q: Record<string, string | string[] | undefined>, k: string): string {
  const v = q[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}
function num(q: Record<string, string | string[] | undefined>, k: string): number | null {
  const s = str(q, k).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const fmt = (n: number, d = 2) => n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

export default async function Logistics({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const form = {
    originCity: str(q, "originCity") || "Istanbul",
    originCountry: (str(q, "originCountry") || "TR").toUpperCase(),
    destCity: str(q, "destCity"),
    destCountry: str(q, "destCountry").toUpperCase(),
    shipmentType: str(q, "shipmentType") === "FTL" ? ("FTL" as const) : ("LTL" as const),
    weightKg: num(q, "weightKg"),
    volumeM3: num(q, "volumeM3"),
    palletCount: num(q, "palletCount"),
    hsCode: str(q, "hsCode") || null,
    goodsValue: num(q, "goodsValue"),
    goodsCurrency: (str(q, "goodsCurrency") || "EUR").toUpperCase(),
  };
  const submitted = Boolean(form.destCountry && form.destCity);

  const [result, freight] = await Promise.all([
    submitted ? resolveLogisticsQuery({ ...form, palletCount: form.palletCount != null ? Math.round(form.palletCount) : null, date: new Date() }) : null,
    listFreightCosts(),
  ]);

  return (
    <>
      <PageHead
        title="Lojistik tahmini"
        description="Navlun tahmini yalnızca gerçek taşıma kayıtlarından üretilir. Piyasa referansı, yakıt ve maliyet endeksleri ayrı gösterilir, birbirine eklenmez."
      />

      <Card title="Sevkiyat">
        <form method="get" className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Çıkış şehri" required>
            <input name="originCity" defaultValue={form.originCity} required className={input} />
          </Field>
          <Field label="Çıkış ülkesi" required hint="ISO: TR">
            <input name="originCountry" defaultValue={form.originCountry} required maxLength={2} className={input} />
          </Field>
          <Field label="Varış şehri" required>
            <input name="destCity" defaultValue={form.destCity} required className={input} placeholder="Berlin" />
          </Field>
          <Field label="Varış ülkesi" required hint="ISO: DE, FR…">
            <input name="destCountry" defaultValue={form.destCountry} required maxLength={2} className={input} placeholder="DE" />
          </Field>
          <Field label="Taşıma tipi">
            <select name="shipmentType" defaultValue={form.shipmentType} className={input}>
              <option value="LTL">Parsiyel (LTL)</option>
              <option value="FTL">Komple (FTL)</option>
            </select>
          </Field>
          <Field label="Palet / koli adedi">
            <input name="palletCount" inputMode="numeric" defaultValue={form.palletCount ?? ""} className={input} />
          </Field>
          <Field label="Ağırlık (kg)">
            <input name="weightKg" inputMode="decimal" defaultValue={form.weightKg ?? ""} className={input} />
          </Field>
          <Field label="Hacim (m³)">
            <input name="volumeM3" inputMode="decimal" defaultValue={form.volumeM3 ?? ""} className={input} />
          </Field>
          <Field label="GTİP / HS kodu">
            <input name="hsCode" defaultValue={form.hsCode ?? ""} className={input} />
          </Field>
          <Field label="Mal bedeli">
            <input name="goodsValue" inputMode="decimal" defaultValue={form.goodsValue ?? ""} className={input} />
          </Field>
          <Field label="Para birimi">
            <input name="goodsCurrency" defaultValue={form.goodsCurrency} maxLength={3} className={input} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={btn.primary}>Hesapla</button>
          </div>
        </form>
      </Card>

      {result ? <ResultView form={form} r={result} /> : null}

      <Card className="mt-4" title="Gerçek navlun kayıtları" description="Business OS'te FREIGHT türünde girilen maliyet satırları">
        {freight.length === 0 ? (
          <EmptyState title="Kayıt yok" description="Satış veya alışa FREIGHT maliyeti girildiğinde burada görünür." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Tarih</Th><Th>Belge</Th><Th>Açıklama</Th><Th align="right">Tutar</Th></tr>
            </thead>
            <tbody>
              {freight.map((f) => (
                <Tr key={f.id}>
                  <Td><DateText value={f.occurredAt} /></Td>
                  <Td>
                    {f.sale ? <Link href={`/os/sales/${f.sale.id}`} className="underline">{f.sale.code}</Link> : null}
                    {f.purchase ? <Link href={`/os/purchases/${f.purchase.id}`} className="underline">{f.purchase.code}</Link> : null}
                  </Td>
                  <Td className="text-muted">{f.label ?? "—"}</Td>
                  <Td align="right"><Money value={f.amount} currency={f.currency} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="mt-3">
          <Note>
            İhracat navlununu satışın maliyet satırına <b>Navlun</b> türünde ve mümkünse <b>EUR</b> olarak gir. Bu kayıtlar
            ileride navlun tahminini gerçek verilerle doğrulamak için kullanılacak.
          </Note>
        </div>
      </Card>
    </>
  );
}

function ResultView({
  form,
  r,
}: {
  form: { originCountry: string; destCountry: string; hsCode: string | null; goodsValue: number | null; goodsCurrency: string };
  r: LogisticsQueryResult;
}) {
  const eurRate = r.fx.eurRate != null ? Number(r.fx.eurRate) : null;
  const toBase = (eur: number) => (eurRate != null ? eur * eurRate : null);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card title="Navlun tahmini" description="Gerçek taşıma gözlemlerinden">
        {r.estimate.status === "OK" ? (
          <div className="space-y-2">
            <p className="text-h5 font-semibold">€{fmt(r.estimate.minEur)} – €{fmt(r.estimate.maxEur)}</p>
            <div className="flex gap-2">
              <Badge tone="info">{r.estimate.evidenceLevel}</Badge>
              <Badge tone="neutral">Güven: {r.estimate.estimateability}</Badge>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge tone="warning">{MISSING}</Badge>
            <p className="text-small text-muted">{r.estimate.reason}</p>
          </div>
        )}
        <div className="mt-3 text-caption text-subtle">
          Ücretli ağırlık: {r.chargeableWeightKg != null ? `${fmt(r.chargeableWeightKg, 0)} kg` : MISSING}
          {r.weightMethod === "VOLUMETRIC_COMPUTED" ? " (hacimden hesaplandı, m³ × 333)" : ""}
        </div>
      </Card>

      <Card title="Piyasa referansı" description="Yayınlanmış fiyat bandı — gerçek navlun değildir">
        {r.marketReferences.length === 0 ? (
          <div className="space-y-2">
            <Badge tone="warning">{MISSING}</Badge>
            <p className="text-small text-muted">Bu güzergah, ağırlık ve palet adedi için eşleşen referans yok.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {r.marketReferences.map((m) => {
              const lo = Number(m.priceType === "RANGE" ? m.priceMin : m.priceExact);
              const hi = Number(m.priceType === "RANGE" ? m.priceMax : m.priceExact);
              const bLo = m.currency === "EUR" ? toBase(lo) : null;
              const bHi = m.currency === "EUR" ? toBase(hi) : null;
              return (
                <div key={m.referenceId} className="space-y-1.5">
                  <p className="text-h5 font-semibold">
                    {m.priceType === "RANGE" ? `${fmt(lo)} – ${fmt(hi)}` : fmt(lo)} {m.currency}
                  </p>
                  {bLo != null && bHi != null ? (
                    <p className="text-caption text-subtle">
                      ≈ {fmt(bLo)} – {fmt(bHi)} {r.fx.baseCurrency} (TCMB {r.fx.bulletinDay})
                    </p>
                  ) : null}
                  <p className="text-caption text-muted">
                    Kapsam: {m.weightScopeType === "UP_TO" ? `≤ ${m.weightScopeMaxKg} kg` : `${m.weightScopeMinKg ?? "?"}–${m.weightScopeMaxKg ?? "?"} kg`}
                  </p>
                  {m.conditionsNote ? <p className="text-caption text-muted">Koşullar: {m.conditionsNote}</p> : null}
                  {m.scopeNote ? <p className="text-caption text-warning">{m.scopeNote}</p> : null}
                  <p className="text-caption text-subtle">
                    Kaynak:{" "}
                    {m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{m.sourceName}</a> : m.sourceName}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Maliyet kalemleri" description="Bilinmeyen kalem uydurulmaz; toplam bu yüzden verilmez" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Gümrük vergisi">
            {form.hsCode ? `${MISSING} — ${form.hsCode} için TARIC oranı sistemde yok` : `${REQUIRED} GTİP/HS kodu`}
          </Detail>
          <Detail label="İthalat KDV'si">
            {form.goodsValue != null ? `${MISSING} — ${form.destCountry} oranı sistemde yok` : `${REQUIRED} mal bedeli`}
          </Detail>
          <Detail label="Gümrük müşaviri">{REQUIRED}</Detail>
          <Detail label="Sigorta">{REQUIRED}</Detail>
          <Detail label="Mal bedeli">
            {form.goodsValue != null ? (
              <>
                <Money value={form.goodsValue} currency={form.goodsCurrency} />
                {r.fx.goodsRate != null && form.goodsCurrency !== r.fx.baseCurrency ? (
                  <span className="text-muted"> ≈ {fmt(form.goodsValue * Number(r.fx.goodsRate))} {r.fx.baseCurrency}</span>
                ) : null}
              </>
            ) : REQUIRED}
          </Detail>
          <Detail label="Kur (EUR)">
            {r.fx.eurRate != null ? `1 EUR = ${fmt(Number(r.fx.eurRate), 4)} ${r.fx.baseCurrency} · ${r.fx.source} ${r.fx.bulletinDay ?? ""}` : MISSING}
          </Detail>
          <Detail label="Mesafe / transit süresi">
            {r.transit.distanceKm != null ? `${fmt(r.transit.distanceKm, 0)} km · süre ${MISSING}` : MISSING}
          </Detail>
        </div>
        <div className="mt-4">
          <Note>
            Türkiye–AB Gümrük Birliği kapsamındaki sanayi ürünlerinde A.TR belgesiyle gümrük vergisi genellikle uygulanmaz;
            bu her GTİP için TARIC&apos;ten ayrıca teyit edilmelidir. Sistem oran varsaymaz.
          </Note>
        </div>
      </Card>

      <Card title="Endeks sinyalleri" description="Bilgi amaçlı — navluna eklenmez" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          {[...new Set([form.originCountry, form.destCountry])].map((c) => {
            const f = r.fuel.find((x) => x.country === c);
            return (
              <Detail key={c} label={`Dizel ${c}`}>
                {f ? `€${fmt(f.priceEurPerLiter, 3)}/L · ${f.periodStart.toISOString().slice(0, 10)} · ${f.sourceName}` : MISSING}
              </Detail>
            );
          })}
          <Detail label="CNR maliyet endeksi">
            {r.cnr
              ? `${fmt(r.cnr.indexValue)} · ${r.cnr.periodStart.toISOString().slice(0, 7)} · ${r.cnr.geography} taşıyıcı maliyeti`
              : MISSING}
          </Detail>
        </div>
      </Card>
    </div>
  );
}
