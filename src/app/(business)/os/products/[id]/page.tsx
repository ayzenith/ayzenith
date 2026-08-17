import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem, itemDocuments } from "@/server/os/items";
import { stockByLocation, listMovements } from "@/server/os/inventory";
import { listChannels } from "@/server/os/channels";
import { getOsSettings } from "@/server/os/settings";
import { setChannelPriceAction } from "../actions";
import { Card, Detail, Money, PageHead, Pct, Qty, StatCard, Table, Td, Th, Tr, Tabs, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Ürün detayı · Business OS" };
export const dynamic = "force-dynamic";
type SP = Promise<{ tab?: string }>;

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [item, docs, stock, movements, channels, settings] = await Promise.all([getItem(id), itemDocuments(id), stockByLocation(id), listMovements({ itemId: id }), listChannels({ activeOnly: true }), getOsSettings()]);
  if (!item) notFound();
  const tab = sp.tab ?? "general";
  const href = (key: string) => `/os/products/${id}${key === "general" ? "" : `?tab=${key}`}`;
  return <>
    <PageHead title={item.name} description={`${item.sku} · ${item.category ?? "Kategorisiz"}`} back={{ href: "/os/products", label: "Ürünler" }} actions={<Link href={`/os/products/${id}/edit`} className={btn.secondary}>Düzenle</Link>} />
    <Tabs current={href(tab)} items={[{ label: "Genel", href: href("general") }, { label: "Stok", href: href("stock") }, { label: "Alışlar", href: href("purchases") }, { label: "Satışlar", href: href("sales") }, { label: "Kanallar", href: href("channels") }, { label: "Kârlılık", href: href("profit") }]} />
    {tab === "general" ? (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Eldeki stok" value={String(stock.reduce((a, r) => a + r.onHand, 0))} hint={item.unit} />
          <StatCard
            label="Gerçek maliyet"
            value={item.stats?.avgCost == null ? "ölçülmedi" : new Intl.NumberFormat("tr-TR").format(item.stats.avgCost) + " " + settings.baseCurrency}
          />
          <StatCard label="Satış fiyatı" value={item.salePrice == null ? "ölçülmedi" : new Intl.NumberFormat("tr-TR").format(item.salePrice) + " " + item.saleCurrency} />
          <StatCard
            label="Marj"
            value={
              item.salePrice && item.stats?.avgCost && item.salePrice > 0
                ? `%${(((item.salePrice - item.stats.avgCost) / item.salePrice) * 100).toFixed(1)}`
                : "ölçülmedi"
            }
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Ürün bilgileri"><div className="grid grid-cols-2 gap-5"><Detail label="Birim">{item.unit}</Detail><Detail label="Barkod">{item.barcode ?? "—"}</Detail><Detail label="Satış fiyatı"><Money value={item.salePrice} currency={item.saleCurrency} /></Detail><Detail label="Alış fiyatı">{item.purchasePrice == null ? "ölçülmedi" : <Money value={item.purchasePrice} currency={item.purchaseCurrency} />}</Detail></div></Card>
          <Card title="Notlar">{item.notes || item.description || <span className="text-muted">Not eklenmemiş.</span>}</Card>
        </div>
      </div>
    ) : null}
    {tab === "stock" ? <Card title="Konumlara göre stok" padded={false}><Table><thead><tr><Th>Konum</Th><Th align="right">Miktar</Th></tr></thead><tbody>{stock.map((r) => <Tr key={r.locationId}><Td>{r.locationName}</Td><Td align="right"><Qty value={r.onHand} unit={item.unit} /></Td></Tr>)}</tbody></Table><div className="p-5"><h2 className="mb-3 text-small font-semibold">Hareket geçmişi</h2><Table><tbody>{movements.rows.map((m) => <Tr key={m.id}><Td>{m.location.name}</Td><Td><Qty value={m.quantity} unit={item.unit} /></Td><Td>{m.reason}</Td></Tr>)}</tbody></Table></div></Card> : null}
    {(tab === "purchases" || tab === "sales") ? <Card padded={false}><Table><thead><tr><Th>Belge</Th><Th>Tarih</Th><Th>Firma</Th><Th align="right">Birim fiyat</Th></tr></thead><tbody>{(tab === "purchases" ? docs.purchases : docs.sales).map((d) => <Tr key={d.id}><Td>{d.code}</Td><Td>{new Date(d.issuedAt).toLocaleDateString("tr-TR")}</Td><Td>{d.partyName ?? "—"}</Td><Td align="right"><Money value={d.unitPrice} currency={d.currency} /></Td></Tr>)}</tbody></Table></Card> : null}
    {tab === "channels" ? <Card title="Kanal fiyatları"><div className="space-y-3">{channels.map((c) => <form key={c.id} action={setChannelPriceAction} className="grid grid-cols-[1fr_10rem_6rem_auto] items-end gap-3"><input type="hidden" name="itemId" value={id}/><input type="hidden" name="channelId" value={c.id}/><span className="pb-2 text-small">{c.name}</span><input className={input} name="price" defaultValue={item.channelPrices.find((p) => p.channelId === c.id)?.price ?? ""} placeholder="Varsayılan fiyat" inputMode="decimal"/><select className={input} name="currency" defaultValue={item.saleCurrency}><option>{item.saleCurrency}</option></select><button className={btn.secondary}>Kaydet</button></form>)}</div></Card> : null}
    {tab === "profit" ? <Card title="Satış satırlarında kârlılık" padded={false}><Table><thead><tr><Th>Belge</Th><Th align="right">Gelir</Th><Th align="right">Kâr</Th><Th align="right">Marj</Th></tr></thead><tbody>{docs.sales.map((d) => { const marginPct = d.revenueBase > 0 ? (d.profit / d.revenueBase) * 100 : null; return <Tr key={d.id}><Td>{d.code}</Td><Td align="right"><Money value={d.revenueBase} currency={settings.baseCurrency}/></Td><Td align="right"><Money value={d.profit} currency={settings.baseCurrency} tone="auto"/></Td><Td align="right">{marginPct == null ? "—" : <Pct value={marginPct} />}</Td></Tr>; })}</tbody></Table></Card> : null}
  </>;
}
