import type { Metadata } from "next";
import Link from "next/link";
import { listCategories, listItems } from "@/server/os/items";
import { getOsSettings } from "@/server/os/settings";
import { ExcelTools } from "@/components/os/excel-tools";
import {
  Badge, Card, EmptyState, FilterBar, Money, PageHead, Pagination, Pct, Qty,
  Table, Td, Th, Tr, btn, input,
} from "@/components/os/ui";

export const metadata: Metadata = { title: "Ürünler · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; category?: string; status?: string; page?: string }>;

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Number.parseInt(sp.page ?? "1", 10) || 1;

  const [settings, categories, data] = await Promise.all([
    getOsSettings(),
    listCategories(),
    listItems({
      search: sp.q,
      category: sp.category || undefined,
      active: sp.status === "passive" ? false : true,
      page,
      perPage: 25,
    }),
  ]);

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.category) query.set("category", sp.category);
  if (sp.status) query.set("status", sp.status);
  const baseHref = `/os/products${query.toString() ? `?${query}` : ""}`;

  return (
    <>
      <PageHead
        title="Ürünler"
        description="Ticaretini yaptığın mallar. Web sitesindeki ürün kataloğundan ayrıdır — burada maliyet, stok ve marj var."
        actions={
          <Link href="/os/products/new" className={btn.primary}>
            + Ürün
          </Link>
        }
      />

      <FilterBar
        action="/os/products"
        right={
          <>
            <ExcelTools
              entity="item"
              entityLabel="Ürünler"
              exportHref={`/os/export?kind=items&${query.toString()}`}
            />
            <a className={btn.secondary} href="/os/report-pdf/products/pdf" target="_blank" rel="noreferrer">PDF</a>
          </>
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Ara</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Ürün, SKU, barkod…" className={`${input} w-56`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Kategori</span>
          <select name="category" defaultValue={sp.category ?? ""} className={`${input} w-40`}>
            <option value="">Hepsi</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Durum</span>
          <select name="status" defaultValue={sp.status ?? ""} className={`${input} w-28`}>
            <option value="">Aktif</option>
            <option value="passive">Pasif</option>
          </select>
        </label>
      </FilterBar>

      <Card padded={false}>
        {data.rows.length === 0 ? (
          <EmptyState
            title={sp.q ? "Bu aramaya uyan ürün yok" : "Henüz ürün yok"}
            description={
              sp.q
                ? "Filtreleri temizleyip tekrar dene."
                : "Ürünlerini tek tek ekleyebilir ya da mevcut listeni Excel'den toplu aktarabilirsin."
            }
            action={
              <Link href="/os/products/new" className={btn.primary}>
                + Ürün ekle
              </Link>
            }
          />
        ) : (
          <>
            <Table stacked>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Ürün</Th>
                  <Th align="right">Stok</Th>
                  <Th align="right">Gerçek maliyet</Th>
                  <Th align="right">Satış fiyatı</Th>
                  <Th align="right">Marj</Th>
                  <Th align="right">Satılan</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((i) => {
                  const low = i.minStock != null && i.onHand <= i.minStock;
                  return (
                    <Tr key={i.id}>
                      <Td className="font-mono text-caption text-muted">{i.sku}</Td>
                      <Td label="Ürün" className="max-w-[20rem]">
                        <Link href={`/os/products/${i.id}`} className="font-medium text-foreground hover:underline">
                          {i.name}
                        </Link>
                        {i.category ? <span className="ml-2 text-caption text-subtle">{i.category}</span> : null}
                        {!i.active ? <Badge className="ml-2">Pasif</Badge> : null}
                      </Td>
                      <Td label="Stok" align="right" numeric>
                        <span className={low ? "text-warning" : undefined}>
                          <Qty value={i.onHand} unit={i.unit} />
                        </span>
                        {low ? <Badge tone="warning" className="ml-2">Düşük</Badge> : null}
                      </Td>
                      <Td label="Gerçek maliyet" align="right" numeric>
                        {i.avgCost == null ? (
                          <span className="text-subtle" title="Henüz maliyetli bir alış girilmedi">
                            ölçülmedi
                          </span>
                        ) : (
                          <Money value={i.avgCost} currency={settings.baseCurrency} />
                        )}
                      </Td>
                      <Td label="Satış fiyatı" align="right" numeric>
                        <Money value={i.salePrice} currency={i.saleCurrency} tone={i.salePrice ? "none" : "muted"} />
                      </Td>
                      <Td label="Marj" align="right" numeric>
                        <Pct value={i.marginPct} />
                      </Td>
                      <Td label="Satılan" align="right" numeric>
                        <Qty value={i.soldQty} />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={data.page} perPage={data.perPage} total={data.total} baseHref={baseHref} />
          </>
        )}
      </Card>
    </>
  );
}
