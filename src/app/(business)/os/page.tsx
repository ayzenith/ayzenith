import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { getOsDashboard } from "@/server/os/dashboard";
import { CASHFLOW_BUCKETS, formatMoney, formatPercent } from "@/config/os";
import {
  Badge, Card, DateText, EmptyState, Money, PageHead, StatCard, StatusBadge,
  Table, Td, Th, Tr, btn,
} from "@/components/os/ui";

export const metadata: Metadata = { title: "Kokpit · Business OS" };
export const dynamic = "force-dynamic";

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function delta(current: number, previous: number): { label: string; tone: "positive" | "negative" | "default" } {
  if (previous === 0) return { label: current > 0 ? "yeni" : "—", tone: current > 0 ? "positive" : "default" };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return {
    label: `${pct >= 0 ? "+" : ""}${formatPercent(pct, 0).replace("%", "")}% geçen aya göre`,
    tone: pct >= 0 ? "positive" : "negative",
  };
}

const ATTENTION_DOT: Record<string, string> = {
  critical: "🔴",
  warning: "🟠",
  info: "🟡",
  ok: "🟢",
};

export default async function OsDashboardPage() {
  const [user, d] = await Promise.all([requireUser(), getOsDashboard()]);
  const cur = d.baseCurrency;
  const revenueDelta = delta(d.month.revenue, d.prevMonth.revenue);
  const profitDelta = delta(d.month.grossProfit, d.prevMonth.grossProfit);

  return (
    <>
      <PageHead
        title={`Merhaba ${firstName(user.name)}`}
        description="İşin bugünkü hâli. Buradaki her rakam veritabanındaki gerçek kayıtlardan hesaplanıyor — hiçbiri elle girilmiyor."
        actions={
          <>
            <Link href="/os/sales/new" className={btn.primary}>
              Satış ekle
            </Link>
            <Link href="/os/purchases/new" className={btn.secondary}>
              Alış ekle
            </Link>
          </>
        }
      />

      {/* Bugün dikkat etmen gerekenler — derived every request, never stored. */}
      <Card title="Bugün dikkat etmen gerekenler" className="mb-6" padded={false}>
        <ul className="divide-y divide-border/60">
          {d.attention.map((a) => (
            <li key={a.label}>
              <Link
                href={a.href}
                className="flex items-center gap-3 px-5 py-3 text-small transition-colors hover:bg-surface-sunken/60"
              >
                <span aria-hidden="true">{ATTENTION_DOT[a.level]}</span>
                <span className="flex-1 text-foreground">{a.label}</span>
                <span className="text-caption text-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {/* Bu ay */}
      <h2 className="mb-3 text-caption font-semibold uppercase tracking-wide text-subtle">Bu ay</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ciro"
          value={formatMoney(d.month.revenue, cur)}
          hint={revenueDelta.label}
          tone={revenueDelta.tone === "default" ? "default" : revenueDelta.tone}
        />
        <StatCard label="Maliyet" value={formatMoney(d.month.cogs + d.month.directCost, cur)} hint={`${d.month.salesCount} satış`} />
        <StatCard
          label="Brüt kâr"
          value={formatMoney(d.month.grossProfit, cur)}
          hint={profitDelta.label}
          tone={d.month.grossProfit < 0 ? "negative" : profitDelta.tone === "default" ? "default" : profitDelta.tone}
        />
        <StatCard
          label="Marj"
          value={d.month.marginPct == null ? "—" : formatPercent(d.month.marginPct)}
          hint="ciro − maliyet − doğrudan gider"
          tone={d.month.marginPct != null && d.month.marginPct < 0 ? "negative" : "default"}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Finance calendar */}
        <Card
          title="Nakit akışı takvimi"
          description="Açık kalan tutarlar, vade tarihine göre"
          actions={
            <Link href="/os/finance" className={btn.ghost}>
              Detay →
            </Link>
          }
          padded={false}
        >
          <Table className="min-w-0">
            <thead>
              <tr>
                <Th>Dönem</Th>
                <Th align="right">Tahsil edilecek</Th>
                <Th align="right">Ödenecek</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {CASHFLOW_BUCKETS.map((b) => {
                const inc = d.cashflow.incoming[b.key];
                const out = d.cashflow.outgoing[b.key];
                const net = inc - out;
                const isOverdue = b.key === "overdue";
                if (isOverdue && inc === 0 && out === 0) return null;
                return (
                  <Tr key={b.key}>
                    <Td>
                      {isOverdue ? <Badge tone="danger">{b.label}</Badge> : <span className="text-muted">{b.label}</span>}
                    </Td>
                    <Td align="right" numeric>
                      <Money value={inc} currency={cur} tone={inc ? "none" : "muted"} />
                    </Td>
                    <Td align="right" numeric>
                      <Money value={out} currency={cur} tone={out ? "none" : "muted"} />
                    </Td>
                    <Td align="right" numeric>
                      <Money value={net} currency={cur} tone="auto" />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        {/* Channels */}
        <Card
          title="Kanal performansı"
          description="Bu ayın cirosu ve kârı"
          actions={
            <Link href="/os/reports?kind=channels" className={btn.ghost}>
              Rapor →
            </Link>
          }
          padded={false}
        >
          {d.topChannels.length === 0 ? (
            <EmptyState
              title="Henüz kanal bazlı satış yok"
              description="Satış eklerken bir kanal seçtiğinde komisyon ve kâr burada kanal kanal görünür."
              action={
                <Link href="/os/channels" className={btn.secondary}>
                  Kanalları kur
                </Link>
              }
            />
          ) : (
            <Table className="min-w-0">
              <thead>
                <tr>
                  <Th>Kanal</Th>
                  <Th align="right">Ciro</Th>
                  <Th align="right">Kâr</Th>
                  <Th align="right">Marj</Th>
                </tr>
              </thead>
              <tbody>
                {d.topChannels.map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.name}</Td>
                    <Td align="right" numeric>
                      <Money value={c.revenue} currency={cur} />
                    </Td>
                    <Td align="right" numeric>
                      <Money value={c.profit} currency={cur} tone="auto" />
                    </Td>
                    <Td align="right" numeric>
                      {c.revenue > 0 ? formatPercent((c.profit / c.revenue) * 100) : "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Son satışlar"
            actions={
              <Link href="/os/sales" className={btn.ghost}>
                Tümü →
              </Link>
            }
            padded={false}
          >
            {d.recentSales.length === 0 ? (
              <EmptyState
                title="Henüz satış yok"
                description={
                  d.configured
                    ? "İlk satışını eklediğinde stok düşer, alacak oluşur ve kâr otomatik hesaplanır."
                    : "Önce bir firma ve bir ürün ekle; sonra ilk satışını kaydet."
                }
                action={
                  <Link href={d.configured ? "/os/sales/new" : "/os/companies/new"} className={btn.primary}>
                    {d.configured ? "Satış ekle" : "Firma ekle"}
                  </Link>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Belge</Th>
                    <Th>Tarih</Th>
                    <Th>Müşteri / Kanal</Th>
                    <Th align="right">Tutar</Th>
                    <Th align="right">Kâr</Th>
                    <Th align="right">Durum</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentSales.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <Link href={`/os/sales/${s.id}`} className="font-medium text-foreground hover:underline">
                          {s.code}
                        </Link>
                      </Td>
                      <Td>
                        <DateText value={s.issuedAt} />
                      </Td>
                      <Td className="max-w-[16rem] truncate">{s.partyName ?? "—"}</Td>
                      <Td align="right" numeric>
                        <Money value={s.total} currency={s.currency} />
                      </Td>
                      <Td align="right" numeric>
                        <Money value={s.profit} currency={cur} tone="auto" />
                      </Td>
                      <Td align="right">
                        <StatusBadge status={s.status} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <StatCard
            label="Stok değeri"
            value={formatMoney(d.stock.value, cur)}
            hint={`${d.stock.skuCount} ürün`}
            href="/os/inventory"
          />
          <StatCard
            label="Düşük stok"
            value={String(d.stock.lowCount)}
            hint="minimum seviyenin altında"
            tone={d.stock.lowCount > 0 ? "warning" : "default"}
            href="/os/inventory?low=1"
          />
          <StatCard label="Firmalar" value={String(d.counts.parties)} hint="aktif kayıt" href="/os/companies" />
          <StatCard label="Ürünler" value={String(d.counts.items)} hint="aktif SKU" href="/os/products" />
        </div>
      </div>
    </>
  );
}
