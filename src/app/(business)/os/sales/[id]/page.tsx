import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSale } from "@/server/os/sales";
import { getOsSettings } from "@/server/os/settings";
import { COST_KIND_LABELS } from "@/config/os";
import { saleAction } from "../actions";
import { Card, Detail, Money, PageHead, Pct, StatusBadge, Table, Td, Th, Tr, btn } from "@/components/os/ui";

export const metadata: Metadata = { title: "Satış detayı · Business OS" };
export const dynamic = "force-dynamic";

export default async function Sale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [x, s] = await Promise.all([getSale(id), getOsSettings()]);
  if (!x) notFound();

  return (
    <>
      <PageHead
        title={x.code}
        description={x.customer?.name ?? "Müşteri seçilmemiş"}
        back={{ href: "/os/sales", label: "Satışlar" }}
        actions={
          <form action={saleAction} className="flex gap-2">
            <input name="id" type="hidden" value={id} />
            {x.status === "DRAFT" ? (
              <>
                <button className={btn.primary} name="kind" value="confirm">Onayla</button>
                <button className={btn.danger} name="kind" value="delete">Sil</button>
              </>
            ) : x.status === "CONFIRMED" ? (
              <button className={btn.danger} name="kind" value="cancel">İptal et</button>
            ) : null}
          </form>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Durum"><StatusBadge status={x.status} /></Detail>
        <Detail label="Tarih">{x.issuedAt.toLocaleDateString("tr-TR")}</Detail>
        <Detail label="Kanal">{x.channel?.name ?? "—"}</Detail>
        <Detail label="Marj">{x.marginPct == null ? "ölçülmedi" : <Pct value={x.marginPct} />}</Detail>
      </div>

      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Ürün</Th>
              <Th align="right">Miktar</Th>
              <Th align="right">Birim fiyat</Th>
              <Th align="right">Birim maliyet</Th>
              <Th align="right">Satır kârı</Th>
            </tr>
          </thead>
          <tbody>
            {x.lines.map((l) => (
              <Tr key={l.id}>
                <Td>{l.sku} — {l.name}</Td>
                <Td align="right">{l.quantity}</Td>
                <Td align="right"><Money value={l.unitPrice} currency={x.currency} /></Td>
                <Td align="right">{l.unitCost == null ? "ölçülmedi" : <Money value={l.unitCost} currency={s.baseCurrency} />}</Td>
                <Td align="right"><Money value={l.profit} currency={s.baseCurrency} tone="auto" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {x.costs.length > 0 ? (
        <Card className="mt-4" title="Ek maliyetler" padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Tür</Th>
                <Th>Açıklama</Th>
                <Th align="right">Tutar</Th>
              </tr>
            </thead>
            <tbody>
              {x.costs.map((c) => (
                <Tr key={c.id}>
                  <Td>{COST_KIND_LABELS[c.kind] ?? c.kind}</Td>
                  <Td>{c.label ?? "—"}</Td>
                  <Td align="right"><Money value={c.amount} currency={c.currency} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {x.payments.length > 0 ? (
        <Card className="mt-4" title="Tahsilat planı" padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Vade</Th>
                <Th align="right">Tutar</Th>
                <Th align="right">Ödenen</Th>
                <Th>Durum</Th>
              </tr>
            </thead>
            <tbody>
              {x.payments.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.dueDate.toLocaleDateString("tr-TR")}</Td>
                  <Td align="right"><Money value={p.amount} currency={p.currency} /></Td>
                  <Td align="right"><Money value={p.paidAmount} currency={p.currency} /></Td>
                  <Td><StatusBadge status={p.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
