import type { Metadata } from "next";
import Link from "next/link";
import { listStock, listLocations, listMovements, stockSummary } from "@/server/os/inventory";
import { listItems } from "@/server/os/items";
import { getOsSettings } from "@/server/os/settings";
import { STOCK_REASON_LABELS } from "@/config/os";
import { ExcelTools } from "@/components/os/excel-tools";
import { adjustStockAction, transferStockAction } from "./actions";
import { Card, FilterBar, Money, PageHead, Pagination, Qty, StatCard, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Stok · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; low?: string; page?: string }>;

export default async function Inventory({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const page = Number(q.page) || 1;
  const [d, sum, s, locations, items, movements] = await Promise.all([
    listStock({ search: q.q, lowOnly: q.low === "1", page }),
    stockSummary(),
    getOsSettings(),
    listLocations(),
    listItems({ perPage: 200, active: true }),
    listMovements({ page: 1, perPage: 20 }),
  ]);

  return (
    <>
      <PageHead
        title="Stok"
        actions={
          <>
            <Link className={btn.secondary} href="/os/inventory/locations">Konumlar</Link>
            <Link className={btn.secondary} href={q.low === "1" ? "/os/inventory" : "/os/inventory?low=1"}>
              {q.low === "1" ? "Tüm ürünler" : "Sadece düşük stok"}
            </Link>
          </>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <StatCard label="Stok değeri" value={new Intl.NumberFormat("tr-TR").format(sum.value) + " " + s.baseCurrency} />
        <StatCard label="Düşük stok" value={String(sum.lowCount)} href="/os/inventory?low=1" />
        <StatCard label="Ürün" value={String(sum.skuCount)} />
      </div>

      <FilterBar action="/os/inventory" right={<ExcelTools entity="stock" entityLabel="Stok" exportHref="/os/export?kind=stock" />}>
        <input name="q" defaultValue={q.q ?? ""} placeholder="SKU, ürün adı, barkod" className={input} />
      </FilterBar>

      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Ürün</Th>
              <Th align="right">Eldeki</Th>
              <Th align="right">Ortalama maliyet</Th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((x) => (
              <Tr key={x.itemId} className={x.low ? "bg-warning/5" : ""}>
                <Td>{x.sku}</Td>
                <Td>
                  <Link href={`/os/products/${x.itemId}?tab=stock`} className="hover:underline">{x.name}</Link>
                </Td>
                <Td align="right"><Qty value={x.onHand} unit={x.unit} /></Td>
                <Td align="right">{x.avgCost == null ? "ölçülmedi" : <Money value={x.avgCost} currency={s.baseCurrency} />}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} perPage={50} total={d.total} baseHref={`/os/inventory${q.q ? `?q=${encodeURIComponent(q.q)}` : ""}`} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Transfer" description="Bir konumdan diğerine stok taşı.">
          <form action={transferStockAction} className="grid gap-3">
            <select name="itemId" required className={input}>
              <option value="">Ürün seç</option>
              {items.rows.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select name="fromLocationId" required className={input}>
                <option value="">Kaynak konum</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select name="toLocationId" required className={input}>
                <option value="">Hedef konum</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <input name="quantity" required inputMode="decimal" placeholder="Miktar" className={input} />
            <input name="note" placeholder="Not (opsiyonel)" className={input} />
            <button type="submit" className={`${btn.primary} self-start`}>Transfer et</button>
          </form>
        </Card>

        <Card title="Düzeltme / açılış / fire" description="Sayım farkı, açılış stoğu veya hasar için tek yönlü hareket.">
          <form action={adjustStockAction} className="grid gap-3">
            <select name="itemId" required className={input}>
              <option value="">Ürün seç</option>
              {items.rows.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
            </select>
            <select name="locationId" required className={input}>
              <option value="">Konum</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select name="reason" className={input} defaultValue="ADJUSTMENT">
                <option value="OPENING">{STOCK_REASON_LABELS.OPENING}</option>
                <option value="ADJUSTMENT">{STOCK_REASON_LABELS.ADJUSTMENT}</option>
                <option value="DAMAGE">{STOCK_REASON_LABELS.DAMAGE}</option>
              </select>
              <select name="direction" className={input} defaultValue="IN">
                <option value="IN">Giriş (+)</option>
                <option value="OUT">Çıkış (−)</option>
              </select>
            </div>
            <input name="quantity" required inputMode="decimal" placeholder="Miktar" className={input} />
            <input name="unitCost" inputMode="decimal" placeholder="Birim maliyet (opsiyonel)" className={input} />
            <input name="note" placeholder="Not (opsiyonel)" className={input} />
            <button type="submit" className={`${btn.primary} self-start`}>Hareketi kaydet</button>
          </form>
        </Card>
      </div>

      <Card className="mt-4" title="Son hareketler" padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Tarih</Th>
              <Th>Ürün</Th>
              <Th>Konum</Th>
              <Th align="right">Miktar</Th>
              <Th>Sebep</Th>
              <Th>Belge</Th>
            </tr>
          </thead>
          <tbody>
            {movements.rows.map((m) => (
              <Tr key={m.id}>
                <Td>{m.occurredAt.toLocaleDateString("tr-TR")}</Td>
                <Td>{m.item.sku}</Td>
                <Td>{m.location.name}</Td>
                <Td align="right"><Qty value={m.quantity} unit={m.item.unit} /></Td>
                <Td>{STOCK_REASON_LABELS[m.reason] ?? m.reason}</Td>
                <Td>{m.docHref ? <Link href={m.docHref} className="hover:underline">{m.docCode}</Link> : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
