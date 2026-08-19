import type { Metadata } from "next";
import {
  salesReport, purchaseReport, profitByItem, customerReport, supplierReport,
  channelReport, cashflowReport, stockReport, reportCountries, type ReportFilter,
} from "@/server/os/reports";
import { getOsSettings } from "@/server/os/settings";
import { CURRENCIES } from "@/config/os";
import { Card, FilterBar, Money, PageHead, Pct, Qty, Table, Tabs, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Raporlar · Business OS" };
export const dynamic = "force-dynamic";

const KINDS = [
  { key: "sales", label: "Satışlar" },
  { key: "purchases", label: "Alışlar" },
  { key: "profit", label: "Ürün kârlılığı" },
  { key: "customers", label: "Müşteriler" },
  { key: "suppliers", label: "Tedarikçiler" },
  { key: "channels", label: "Kanallar" },
  { key: "cashflow", label: "Nakit akışı" },
  { key: "stock", label: "Stok" },
] as const;

type SP = Promise<{ kind?: string; from?: string; to?: string; country?: string; currency?: string }>;

export default async function Reports({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const kind = KINDS.some((k) => k.key === sp.kind) ? sp.kind! : "sales";
  const settings = await getOsSettings();
  const countries = await reportCountries();

  const filter: ReportFilter = {
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    country: sp.country || undefined,
    currency: sp.currency || undefined,
  };

  const exportParams = new URLSearchParams({ kind: "report", report: kind });
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  if (sp.country) exportParams.set("country", sp.country);
  if (sp.currency) exportParams.set("currency", sp.currency);

  return (
    <>
      <PageHead title="Raporlar" description="Raporlar yalnızca kaydedilmiş belge ve defter hareketlerinden oluşur." />
      <Tabs current={`/os/reports?kind=${kind}`} items={KINDS.map((k) => ({ label: k.label, href: `/os/reports?kind=${k.key}` }))} />

      <FilterBar
        action="/os/reports"
        right={<a href={`/os/export?${exportParams.toString()}`} className={btn.secondary}>Excel&apos;e aktar</a>}
      >
        <input type="hidden" name="kind" value={kind} />
        <input name="from" type="date" defaultValue={sp.from ?? ""} className={input} />
        <input name="to" type="date" defaultValue={sp.to ?? ""} className={input} />
        <select name="country" defaultValue={sp.country ?? ""} className={input}>
          <option value="">Tüm ülkeler</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="currency" defaultValue={sp.currency ?? ""} className={input}>
          <option value="">Tüm para birimleri</option>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
      </FilterBar>

      <Card padded={false}>
        {kind === "sales" ? <SalesTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "purchases" ? <PurchasesTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "profit" ? <ProfitTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "customers" ? <CustomersTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "suppliers" ? <SuppliersTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "channels" ? <ChannelsTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "cashflow" ? <CashflowTable filter={filter} baseCurrency={settings.baseCurrency} /> : null}
        {kind === "stock" ? <StockTable baseCurrency={settings.baseCurrency} /> : null}
      </Card>
    </>
  );
}

async function SalesTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const { rows, totals } = await salesReport(filter);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Belge</Th><Th>Tarih</Th><Th>Müşteri</Th><Th>Kanal</Th>
          <Th align="right">Gelir</Th><Th align="right">Maliyet</Th><Th align="right">Kâr</Th><Th align="right">Marj</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.code}>
            <Td>{r.code}</Td><Td>{r.issuedAt.toLocaleDateString("tr-TR")}</Td>
            <Td>{r.customerName ?? "—"}</Td><Td>{r.channelName ?? "—"}</Td>
            <Td align="right"><Money value={r.baseRevenue} currency={baseCurrency} /></Td>
            <Td align="right"><Money value={r.cogs + r.directCost} currency={baseCurrency} /></Td>
            <Td align="right"><Money value={r.profit} currency={baseCurrency} tone="auto" /></Td>
            <Td align="right">{r.marginPct == null ? "—" : <Pct value={r.marginPct} />}</Td>
          </Tr>
        ))}
        <Tr className="font-semibold">
          <Td colSpan={4}>Toplam</Td>
          <Td align="right"><Money value={totals.revenue} currency={baseCurrency} /></Td>
          <Td align="right"><Money value={totals.cogs + totals.cost} currency={baseCurrency} /></Td>
          <Td align="right"><Money value={totals.profit} currency={baseCurrency} tone="auto" /></Td>
          <Td />
        </Tr>
      </tbody>
    </Table>
  );
}

async function PurchasesTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const { rows, totals } = await purchaseReport(filter);
  return (
    <Table>
      <thead>
        <tr><Th>Belge</Th><Th>Tarih</Th><Th>Tedarikçi</Th><Th align="right">Mal bedeli</Th><Th align="right">Ek maliyet</Th><Th align="right">Toplam</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.code}>
            <Td>{r.code}</Td><Td>{r.issuedAt.toLocaleDateString("tr-TR")}</Td><Td>{r.supplierName}</Td>
            <Td align="right"><Money value={r.subtotal} currency={r.currency} /></Td>
            <Td align="right"><Money value={r.costTotal} currency={r.currency} /></Td>
            <Td align="right"><Money value={r.baseTotal} currency={baseCurrency} /></Td>
          </Tr>
        ))}
        <Tr className="font-semibold">
          <Td colSpan={3}>Toplam</Td>
          <Td align="right"><Money value={totals.goods} currency={baseCurrency} /></Td>
          <Td align="right"><Money value={totals.costs} currency={baseCurrency} /></Td>
          <Td align="right"><Money value={totals.total} currency={baseCurrency} /></Td>
        </Tr>
      </tbody>
    </Table>
  );
}

async function ProfitTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const rows = await profitByItem(filter);
  return (
    <Table stacked>
      <thead>
        <tr><Th>SKU</Th><Th>Ürün</Th><Th align="right">Adet</Th><Th align="right">Gelir</Th><Th align="right">Maliyet</Th><Th align="right">Kâr</Th><Th align="right">Marj</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.itemId}>
            <Td>{r.sku}</Td><Td label="Ürün">{r.name}</Td>
            <Td label="Adet" align="right"><Qty value={r.qty} unit={r.unit} /></Td>
            <Td label="Gelir" align="right"><Money value={r.revenue} currency={baseCurrency} /></Td>
            <Td label="Maliyet" align="right"><Money value={r.cost} currency={baseCurrency} /></Td>
            <Td label="Kâr" align="right"><Money value={r.profit} currency={baseCurrency} tone="auto" /></Td>
            <Td label="Marj" align="right">{r.marginPct == null ? "—" : <Pct value={r.marginPct} />}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

async function CustomersTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const rows = await customerReport(filter);
  return (
    <Table stacked>
      <thead>
        <tr><Th>Müşteri</Th><Th>Ülke</Th><Th align="right">Satış adedi</Th><Th align="right">Ciro</Th><Th align="right">Kâr</Th><Th align="right">Açık alacak</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.partyId}>
            <Td>{r.name}</Td><Td label="Ülke">{r.country}</Td><Td label="Satış adedi" align="right">{r.salesCount}</Td>
            <Td label="Ciro" align="right"><Money value={r.revenue} currency={baseCurrency} /></Td>
            <Td label="Kâr" align="right"><Money value={r.profit} currency={baseCurrency} tone="auto" /></Td>
            <Td label="Açık alacak" align="right"><Money value={r.openReceivable} currency={baseCurrency} /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

async function SuppliersTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const rows = await supplierReport(filter);
  return (
    <Table stacked>
      <thead>
        <tr><Th>Tedarikçi</Th><Th>Ülke</Th><Th align="right">Alış adedi</Th><Th align="right">Toplam</Th><Th align="right">Açık borç</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.partyId}>
            <Td>{r.name}</Td><Td label="Ülke">{r.country}</Td><Td label="Alış adedi" align="right">{r.purchaseCount}</Td>
            <Td label="Toplam" align="right"><Money value={r.total} currency={baseCurrency} /></Td>
            <Td label="Açık borç" align="right"><Money value={r.openPayable} currency={baseCurrency} /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

async function ChannelsTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const rows = await channelReport(filter);
  return (
    <Table stacked>
      <thead>
        <tr><Th>Kanal</Th><Th align="right">Satış adedi</Th><Th align="right">Ciro</Th><Th align="right">Komisyon</Th><Th align="right">Kâr</Th><Th align="right">Marj</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.channelId ?? "none"}>
            <Td>{r.name}</Td><Td label="Satış adedi" align="right">{r.salesCount}</Td>
            <Td label="Ciro" align="right"><Money value={r.revenue} currency={baseCurrency} /></Td>
            <Td label="Komisyon" align="right"><Money value={r.commission} currency={baseCurrency} /></Td>
            <Td label="Kâr" align="right"><Money value={r.profit} currency={baseCurrency} tone="auto" /></Td>
            <Td label="Marj" align="right">{r.marginPct == null ? "—" : <Pct value={r.marginPct} />}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

async function CashflowTable({ filter, baseCurrency }: { filter: ReportFilter; baseCurrency: string }) {
  const rows = await cashflowReport(filter);
  return (
    <Table stacked>
      <thead>
        <tr><Th>Ay</Th><Th align="right">Girecek</Th><Th align="right">Çıkacak</Th><Th align="right">Net</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.month}>
            <Td>{r.month}</Td>
            <Td label="Girecek" align="right"><Money value={r.incoming} currency={baseCurrency} /></Td>
            <Td label="Çıkacak" align="right"><Money value={r.outgoing} currency={baseCurrency} /></Td>
            <Td label="Net" align="right"><Money value={r.net} currency={baseCurrency} tone="auto" /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

async function StockTable({ baseCurrency }: { baseCurrency: string }) {
  const { rows, totalValue } = await stockReport();
  return (
    <Table>
      <thead>
        <tr><Th>SKU</Th><Th>Ürün</Th><Th align="right">Eldeki</Th><Th align="right">Ortalama maliyet</Th><Th align="right">Değer</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.sku} className={r.low ? "bg-warning/5" : ""}>
            <Td>{r.sku}</Td><Td>{r.name}</Td>
            <Td align="right"><Qty value={r.onHand} unit={r.unit} /></Td>
            <Td align="right">{r.avgCost == null ? "ölçülmedi" : <Money value={r.avgCost} currency={baseCurrency} />}</Td>
            <Td align="right"><Money value={r.value} currency={baseCurrency} /></Td>
          </Tr>
        ))}
        <Tr className="font-semibold">
          <Td colSpan={4}>Toplam değer</Td>
          <Td align="right"><Money value={totalValue} currency={baseCurrency} /></Td>
        </Tr>
      </tbody>
    </Table>
  );
}
