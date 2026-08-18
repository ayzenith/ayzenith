import type { Metadata } from "next";
import Link from "next/link";
import { listPayments } from "@/server/os/finance";
import { listParties } from "@/server/os/parties";
import { PAYMENT_METHOD_LABELS } from "@/config/os";
import { cancelPaymentAction, createPaymentAction, settlePaymentAction } from "./actions";
import { Card, EmptyState, Field, Money, PageHead, Pagination, StatusBadge, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";
import { AmountInput } from "@/components/os/amount-input";

export const metadata: Metadata = { title: "Tahsilat ve ödemeler · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ direction?: "IN" | "OUT"; overdue?: string; new?: "IN" | "OUT"; page?: string }>;

export default async function Payments({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const [d, parties] = await Promise.all([
    listPayments({ direction: q.direction, overdueOnly: q.overdue === "1", page: Number(q.page) || 1 }),
    listParties({ perPage: 200 }),
  ]);
  const title = q.direction === "OUT" ? "Ödemeler" : q.direction === "IN" ? "Tahsilatlar" : "Tahsilat & ödeme";
  const baseHref = `/os/payments${q.direction ? `?direction=${q.direction}` : ""}`;

  return (
    <>
      <PageHead
        title={title}
        description="Gecikme vade ve durumdan okunur; ayrıca saklanmaz."
        actions={
          <>
            <Link className={btn.secondary} href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}overdue=1`}>Gecikmişler</Link>
            <Link className={btn.primary} href="/os/payments?new=IN">+ Tahsilat</Link>
            <Link className={btn.primary} href="/os/payments?new=OUT">+ Ödeme</Link>
          </>
        }
      />

      {q.new ? (
        <Card className="mb-4" title={q.new === "IN" ? "Yeni tahsilat planı" : "Yeni ödeme planı"} description="Bir belgeye bağlı olmayan alacak/borç — avans, kredi gibi.">
          <form action={createPaymentAction} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <input type="hidden" name="direction" value={q.new} />
            <Field label="Firma">
              <select name="partyId" className={input}>
                <option value="">Seçilmedi</option>
                {parties.rows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Tutar" required>
              <input name="amount" required inputMode="decimal" className={input} />
            </Field>
            <Field label="Para birimi">
              <input name="currency" defaultValue="TRY" className={input} />
            </Field>
            <Field label="Kur">
              <input name="fxRate" defaultValue="1" inputMode="decimal" className={input} />
            </Field>
            <Field label="Vade" required>
              <input name="dueDate" type="date" required className={input} />
            </Field>
            <Field label="Not">
              <input name="note" className={input} />
            </Field>
            <div className="sm:col-span-3 lg:col-span-6">
              <button type="submit" className={btn.primary}>Kaydet</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card padded={false}>
        {d.rows.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Firma / belge</Th>
                  <Th>Vade</Th>
                  <Th align="right">Açık tutar</Th>
                  <Th>Durum</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {d.rows.map((x) => (
                  <Tr key={x.id} className={x.overdue ? "bg-error/5" : ""}>
                    <Td>{x.partyName ?? x.docCode ?? "—"}</Td>
                    <Td>{x.dueDate.toLocaleDateString("tr-TR")}</Td>
                    <Td align="right"><Money value={x.open} currency={x.currency} /></Td>
                    <Td><StatusBadge status={x.status} /></Td>
                    <Td align="right">
                      {x.paidAmount > 0 ? (
                        <a className={`${btn.ghost} mb-1 ml-auto w-fit`} href={`/os/receipts/payment/${x.id}/pdf`} target="_blank" rel="noreferrer">
                          Makbuz
                        </a>
                      ) : null}
                      {x.status === "PENDING" || x.status === "PARTIAL" ? (
                        <details key={`${x.id}-${x.status}-${x.open}`} className="inline-block w-72 text-left">
                          <summary className={`${btn.secondary} cursor-pointer`}>
                            {x.direction === "IN" ? "Tahsil et" : "Öde"}
                          </summary>
                          <div className="mt-2 w-72 rounded-lg border border-border bg-surface p-3 shadow-xl">
                            <form action={settlePaymentAction} className="flex flex-col gap-2">
                              <input type="hidden" name="id" value={x.id} />
                              <Field label="Tutar" required>
                                <AmountInput name="amount" defaultValue={x.open} className={input} />
                              </Field>
                              <Field label="Tarih">
                                <input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
                              </Field>
                              <Field label="Yöntem">
                                <select name="method" className={input} defaultValue="">
                                  <option value="">Seçilmedi</option>
                                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                                    <option key={k} value={k}>{l}</option>
                                  ))}
                                </select>
                              </Field>
                              <button type="submit" className={btn.primary}>Kaydet</button>
                            </form>
                          </div>
                        </details>
                      ) : null}
                      {x.status === "PENDING" || x.status === "PARTIAL" ? (
                        <form action={cancelPaymentAction} className="mt-1">
                          <input type="hidden" name="id" value={x.id} />
                          <button className={btn.ghost}>İptal et</button>
                        </form>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...d} baseHref={baseHref} />
          </>
        ) : (
          <EmptyState title="Kayıt yok" description="Bu filtrede tahsilat veya ödeme kaydı bulunamadı." />
        )}
      </Card>
    </>
  );
}
