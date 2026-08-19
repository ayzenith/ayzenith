import type { Metadata } from "next";
import { channelPerformance, listChannels } from "@/server/os/channels";
import { getOsSettings } from "@/server/os/settings";
import { CHANNEL_TYPE_LABELS } from "@/config/os";
import { deleteChannelAction, seedStarterChannelsAction, upsertChannelAction } from "./actions";
import { Card, EmptyState, Field, Money, PageHead, Table, Td, Th, Tr, btn, input } from "@/components/os/ui";

export const metadata: Metadata = { title: "Satış kanalları · Business OS" };
export const dynamic = "force-dynamic";

export default async function Channels() {
  const [rows, p, s] = await Promise.all([listChannels(), channelPerformance(), getOsSettings()]);

  return (
    <>
      <PageHead title="Satış kanalları" description="Her kanalda satış, komisyon ve kâr ayrı izlenir." />

      {rows.length === 0 ? (
        <Card className="mb-4">
          <EmptyState
            title="Henüz kanal yok"
            description="Trendyol, Amazon, Web, Mağaza, B2B, Manuel — başlangıç setini tek tıkla oluştur."
            action={
              <form action={seedStarterChannelsAction}>
                <button type="submit" className={btn.primary}>Başlangıç kanallarını oluştur</button>
              </form>
            }
          />
        </Card>
      ) : null}

      <Card className="mb-4" title="Yeni kanal">
        <form action={upsertChannelAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ad" required>
            <input name="name" required className={input} placeholder="Trendyol" />
          </Field>
          <Field label="Tür">
            <select name="type" className={input} defaultValue="OTHER">
              {Object.entries(CHANNEL_TYPE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Komisyon %" hint="Boş bırakılırsa komisyon eklenmez">
            <input name="commissionRate" inputMode="decimal" className={input} />
          </Field>
          <Field label="Para birimi">
            <input name="currency" defaultValue="TRY" className={input} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className={btn.primary}>Kanalı kaydet</button>
          </div>
        </form>
      </Card>

      {rows.length > 0 ? (
        <Card padded={false}>
          <Table stacked>
            <thead>
              <tr>
                <Th>Kanal</Th>
                <Th>Tür</Th>
                <Th align="right">Ciro</Th>
                <Th align="right">Komisyon</Th>
                <Th align="right">Kâr</Th>
                <Th>Durum</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const a = p.get(x.id);
                return (
                  <Tr key={x.id}>
                    <Td>{x.name}</Td>
                    <Td label="Tür">{CHANNEL_TYPE_LABELS[x.type] ?? x.type}</Td>
                    <Td label="Ciro" align="right"><Money value={a?.revenue} currency={s.baseCurrency} /></Td>
                    <Td label="Komisyon" align="right"><Money value={a?.commissionCost} currency={s.baseCurrency} /></Td>
                    <Td label="Kâr" align="right"><Money value={a?.profit} currency={s.baseCurrency} /></Td>
                    <Td label="Durum">{x.active ? "Aktif" : "Pasif"}</Td>
                    <Td align="right">
                      <form action={deleteChannelAction}>
                        <input type="hidden" name="id" value={x.id} />
                        <button className={btn.ghost}>Sil</button>
                      </form>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
