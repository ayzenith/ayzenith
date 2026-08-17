import type { Metadata } from "next";
import Link from "next/link";
import { listExpenses, listRecurring } from "@/server/os/finance";
import { listParties } from "@/server/os/parties";
import { EXPENSE_KIND_LABELS, RECURRENCE_LABELS } from "@/config/os";
import { createExpenseAction, deleteExpenseAction, deleteRecurringAction, upsertRecurringAction } from "./actions";
import { Card, EmptyState, Field, Money, PageHead, StatCard, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Giderler · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ new?: string }>;

export default async function ExpensesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [e, recurring, parties] = await Promise.all([
    listExpenses(),
    listRecurring(),
    listParties({ perPage: 200 }),
  ]);

  return (
    <>
      <PageHead
        title="Giderler"
        description="Giderler nakit akışına vadesiyle yansır."
        actions={
          <Link href={sp.new === "1" ? "/os/expenses" : "/os/expenses?new=1"} className={btn.primary}>
            {sp.new === "1" ? "Vazgeç" : "+ Gider"}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <StatCard label="Toplam gider (baz para birimi)" value={new Intl.NumberFormat("tr-TR").format(e.baseTotal)} />
        <StatCard label="Kayıt sayısı" value={String(e.total)} />
      </div>

      {sp.new === "1" ? (
        <Card className="mb-4" title="Yeni gider">
          <form action={createExpenseAction} className="grid gap-4 sm:grid-cols-3">
            <Field label="Başlık" required className="sm:col-span-2">
              <input name="title" required className={input} placeholder="Ofis kirası" />
            </Field>
            <Field label="Tür">
              <select name="kind" className={input} defaultValue="OTHER">
                {Object.entries(EXPENSE_KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Firma">
              <select name="partyId" className={input}>
                <option value="">Seçilmedi</option>
                {parties.rows.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
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
            <Field label="Tarih">
              <input name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
            </Field>
            <Field label="Vade">
              <input name="dueDate" type="date" className={input} />
            </Field>
            <Field label="Not" className="sm:col-span-3">
              <input name="note" className={input} />
            </Field>
            <div className="sm:col-span-3">
              <button type="submit" className={btn.primary}>Gideri kaydet</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Giderler" padded={false}>
        {e.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Gider</Th>
                <Th>Tür</Th>
                <Th align="right">Tutar</Th>
                <Th>Durum</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {e.rows.map((x) => (
                <Tr key={x.id}>
                  <Td>{x.title}{x.recurring ? " · tekrarlayan" : ""}</Td>
                  <Td>{EXPENSE_KIND_LABELS[x.kind] ?? x.kind}</Td>
                  <Td align="right"><Money value={x.amount} currency={x.currency} /></Td>
                  <Td>{x.paid ? "Ödendi" : "Bekliyor"}</Td>
                  <Td align="right">
                    <form action={deleteExpenseAction}>
                      <input type="hidden" name="id" value={x.id} />
                      <button className={btn.ghost}>Sil</button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Henüz gider yok" description="İlk giderini ekle." />
        )}
      </Card>

      <Card className="mt-4" title="Tekrarlayan giderler" description="Kira, maaş gibi düzenli giderler otomatik olarak takvime yansır.">
        <div className="flex flex-col gap-4">
          {recurring.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Başlık</Th>
                  <Th>Sıklık</Th>
                  <Th align="right">Tutar</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.title}</Td>
                    <Td>{RECURRENCE_LABELS[r.frequency] ?? r.frequency}</Td>
                    <Td align="right"><Money value={r.amount} currency={r.currency} /></Td>
                    <Td align="right">
                      <form action={deleteRecurringAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className={btn.ghost}>Sil</button>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}

          <details>
            <summary className="cursor-pointer text-small font-medium text-muted">+ Tekrarlayan gider ekle</summary>
            <form action={upsertRecurringAction} className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Başlık" required className="sm:col-span-2">
                <input name="title" required className={input} />
              </Field>
              <Field label="Tür">
                <select name="kind" className={input} defaultValue="OTHER">
                  {Object.entries(EXPENSE_KIND_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tutar" required>
                <input name="amount" required inputMode="decimal" className={input} />
              </Field>
              <Field label="Para birimi">
                <input name="currency" defaultValue="TRY" className={input} />
              </Field>
              <Field label="Sıklık">
                <select name="frequency" className={input} defaultValue="MONTHLY">
                  {Object.entries(RECURRENCE_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ayın günü" hint="1–28 arası">
                <input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} className={input} />
              </Field>
              <Field label="Başlangıç">
                <input name="startsAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
              </Field>
              <div className="sm:col-span-3">
                <button type="submit" className={btn.primary}>Tekrarlayan gideri kaydet</button>
              </div>
            </form>
          </details>
        </div>
      </Card>
    </>
  );
}
