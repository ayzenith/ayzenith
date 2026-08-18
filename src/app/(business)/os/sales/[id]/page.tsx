import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSale } from "@/server/os/sales";
import { getOsSettings } from "@/server/os/settings";
import { listDocumentsForSale } from "@/server/os/trade-documents";
import { COST_KIND_LABELS } from "@/config/os";
import { docTitle } from "@/config/trade-documents";
import { saleAction } from "../actions";
import { createDocumentAction } from "../../documents/actions";
import {
  Badge, Card, Detail, EmptyState, Money, PageHead, Pct, StatusBadge, Table, Tabs, Td, Th, Tr, btn, input,
} from "@/components/os/ui";

export const metadata: Metadata = { title: "Satış detayı · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ tab?: string }>;

const TABS = [
  { key: "genel", label: "Genel" },
  { key: "urunler", label: "Ürünler" },
  { key: "odemeler", label: "Ödemeler" },
  { key: "maliyetler", label: "Maliyetler" },
  { key: "belgeler", label: "Belgeler" },
];

export default async function Sale({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : "genel";
  const [x, s, docs] = await Promise.all([getSale(id), getOsSettings(), listDocumentsForSale(id)]);
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

      <Tabs
        items={TABS.map((t) => ({ label: t.label, href: `/os/sales/${id}?tab=${t.key}`, count: t.key === "belgeler" ? docs.length : undefined }))}
        current={`/os/sales/${id}?tab=${tab}`}
      />

      {tab === "genel" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Durum"><StatusBadge status={x.status} /></Detail>
          <Detail label="Tarih">{x.issuedAt.toLocaleDateString("tr-TR")}</Detail>
          <Detail label="Kanal">{x.channel?.name ?? "—"}</Detail>
          <Detail label="Marj">{x.marginPct == null ? "ölçülmedi" : <Pct value={x.marginPct} />}</Detail>
        </div>
      ) : null}

      {tab === "urunler" ? (
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
      ) : null}

      {tab === "maliyetler" ? (
        x.costs.length > 0 ? (
          <Card padded={false}>
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
        ) : (
          <EmptyState title="Ek maliyet yok" />
        )
      ) : null}

      {tab === "odemeler" ? (
        x.payments.length > 0 ? (
          <Card padded={false}>
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
        ) : (
          <EmptyState title="Tahsilat planı yok" />
        )
      ) : null}

      {tab === "belgeler" ? (
        <div className="flex flex-col gap-4">
          <Card title="Yeni belge" description="Bu satıştan bir ticari belge oluştur.">
            <form action={createDocumentAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="saleId" value={id} />
              <select name="docType" className={input} style={{ width: "auto" }} required>
                <option value="QUOTATION">{docTitle("TR", "QUOTATION")}</option>
                <option value="PROFORMA_INVOICE">{docTitle("TR", "PROFORMA_INVOICE")}</option>
                <option value="COMMERCIAL_INVOICE">{docTitle("TR", "COMMERCIAL_INVOICE")}</option>
                <option value="PACKING_LIST">{docTitle("TR", "PACKING_LIST")}</option>
              </select>
              <button type="submit" className={btn.primary}>Belge oluştur</button>
            </form>
          </Card>

          {docs.length === 0 ? (
            <EmptyState title="Henüz belge yok" description="Yukarıdan bir belge türü seçip oluşturabilirsin." />
          ) : (
            <Card padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Belge</Th>
                    <Th>No</Th>
                    <Th>Dil</Th>
                    <Th>Durum</Th>
                    <Th>Versiyon</Th>
                    <Th align="right">Tarih</Th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <Tr key={d.id}>
                      <Td>{docTitle("TR", d.docType)}</Td>
                      <Td>
                        <Link href={`/os/documents/${d.id}`} className="font-medium text-navy-900 hover:underline">
                          {d.code}
                        </Link>
                      </Td>
                      <Td>{d.language}</Td>
                      <Td>
                        <Badge tone={d.status === "FINAL" ? "success" : d.status === "CANCELLED" ? "neutral" : "warning"}>
                          {d.status === "DRAFT" ? "Taslak" : d.status === "FINAL" ? "Kesin" : "İptal"}
                        </Badge>
                        {!d.isLatest ? <Badge tone="neutral" className="ml-1.5">eski versiyon</Badge> : null}
                      </Td>
                      <Td>v{d.version}</Td>
                      <Td align="right">{d.issuedAt.toLocaleDateString("tr-TR")}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
