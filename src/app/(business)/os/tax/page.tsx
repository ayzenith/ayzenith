import type { Metadata } from "next";
import { listTaxRecords } from "@/server/os/finance";
import { TAX_KIND_SUGGESTIONS, TAX_STATUS_LABELS } from "@/config/os";
import { deleteTaxAction, markTaxPaidAction, upsertTaxAction } from "./actions";
import { Card, EmptyState, Field, Money, Note, PageHead, StatusBadge, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Vergi takvimi · Business OS" };
export const dynamic = "force-dynamic";

export default async function Tax() {
  const rows = await listTaxRecords();

  return (
    <>
      <PageHead title="Vergi takvimi" />
      <Note>
        Vergi hesaplanmaz. Buraya muhasebecinden gelen tutarları kaydedersin; sistem sadece vadesini
        hatırlatır ve nakit akışına yansıtır.
      </Note>

      <Card className="mt-4" title="Yeni kayıt">
        <form action={upsertTaxAction} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Tür" required>
            <input name="kind" required list="tax-kinds" className={input} placeholder="KDV" />
            <datalist id="tax-kinds">
              {TAX_KIND_SUGGESTIONS.map((k) => <option key={k} value={k} />)}
            </datalist>
          </Field>
          <Field label="Dönem" required hint="Örn. 2026-08">
            <input name="period" required className={input} placeholder="2026-08" />
          </Field>
          <Field label="Tutar">
            <input name="amount" inputMode="decimal" className={input} />
          </Field>
          <Field label="Para birimi">
            <input name="currency" defaultValue="TRY" className={input} />
          </Field>
          <Field label="Vade" required>
            <input name="dueDate" type="date" required className={input} />
          </Field>
          <Field label="Durum">
            <select name="status" className={input} defaultValue="PLANNED">
              {Object.entries(TAX_STATUS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-3 lg:col-span-6">
            <button type="submit" className={btn.primary}>Kaydet</button>
          </div>
        </form>
      </Card>

      <Card className="mt-4" padded={false}>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Tür / dönem</Th>
                <Th>Vade</Th>
                <Th align="right">Tutar</Th>
                <Th>Durum</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <Tr key={x.id} className={x.overdue ? "bg-error/5" : ""}>
                  <Td>{x.kind} · {x.period}</Td>
                  <Td>{x.dueDate.toLocaleDateString("tr-TR")}</Td>
                  <Td align="right">{x.amount == null ? "ölçülmedi" : <Money value={x.amount} currency={x.currency} />}</Td>
                  <Td><StatusBadge status={x.status} /></Td>
                  <Td align="right">
                    <div className="flex justify-end gap-2">
                      {x.status !== "PAID" && x.status !== "CANCELLED" ? (
                        <form action={markTaxPaidAction}>
                          <input type="hidden" name="id" value={x.id} />
                          <button className={btn.secondary}>Ödendi işaretle</button>
                        </form>
                      ) : null}
                      <form action={deleteTaxAction}>
                        <input type="hidden" name="id" value={x.id} />
                        <button className={btn.ghost}>Sil</button>
                      </form>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Henüz vergi kaydı yok" description="Muhasebecinden gelen tutarı yukarıdan ekle." />
        )}
      </Card>
    </>
  );
}
