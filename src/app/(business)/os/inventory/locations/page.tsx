import type { Metadata } from "next";
import { listLocations } from "@/server/os/inventory";
import { STOCK_LOCATION_TYPE_LABELS } from "@/config/os";
import { deactivateLocationAction, upsertLocationAction } from "./actions";
import { Card, Field, PageHead, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Stok konumları · Business OS" };
export const dynamic = "force-dynamic";

export default async function Locations() {
  const rows = await listLocations(false);

  return (
    <>
      <PageHead title="Stok konumları" back={{ href: "/os/inventory", label: "Stok" }} />

      <Card className="mb-4" title="Yeni konum">
        <form action={upsertLocationAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Ad" required>
            <input name="name" required className={input} placeholder="İstanbul Depo" />
          </Field>
          <Field label="Tür">
            <select name="type" className={input} defaultValue="WAREHOUSE">
              {Object.entries(STOCK_LOCATION_TYPE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Ülke">
            <input name="country" maxLength={2} className={`${input} uppercase`} placeholder="TR" />
          </Field>
          <Field label="Şehir">
            <input name="city" className={input} />
          </Field>
          <Field label="Varsayılan">
            <label className="flex h-[2.375rem] items-center gap-2.5 text-small">
              <input type="checkbox" name="isDefault" className="size-4 rounded border-border" />
              Yeni belgeler bu konuma açılsın
            </label>
          </Field>
          <div className="sm:col-span-2 lg:col-span-5">
            <button type="submit" className={btn.primary}>Konumu kaydet</button>
          </div>
        </form>
      </Card>

      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Konum</Th>
              <Th>Tür</Th>
              <Th>Durum</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <Tr key={x.id}>
                <Td>{x.name}{x.isDefault ? " · varsayılan" : ""}</Td>
                <Td>{STOCK_LOCATION_TYPE_LABELS[x.type] ?? x.type}</Td>
                <Td>{x.active ? "Aktif" : "Pasif"}</Td>
                <Td align="right">
                  {x.active ? (
                    <form action={deactivateLocationAction}>
                      <input type="hidden" name="id" value={x.id} />
                      <button className={btn.ghost}>Sil / pasife al</button>
                    </form>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
