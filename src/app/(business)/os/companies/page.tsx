import type { Metadata } from "next";
import Link from "next/link";
import type { PartyRoleType } from "@prisma/client";
import { listParties } from "@/server/os/parties";
import { getOsSettings } from "@/server/os/settings";
import { PARTY_ROLE_LABELS, PARTY_ROLE_ORDER } from "@/config/os";
import { ExcelTools } from "@/components/os/excel-tools";
import {
  Badge, Card, DateText, EmptyState, FilterBar, Money, PageHead, Pagination,
  Table, Td, Th, Tr, btn, input,
} from "@/components/os/ui";

export const metadata: Metadata = { title: "Firmalar · Business OS" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; role?: string; country?: string; status?: string; page?: string }>;

export default async function CompaniesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Number.parseInt(sp.page ?? "1", 10) || 1;
  const showPassive = sp.status === "passive";

  const [settings, data] = await Promise.all([
    getOsSettings(),
    listParties({
      search: sp.q,
      role: (sp.role as PartyRoleType) || undefined,
      country: sp.country || undefined,
      active: showPassive ? false : true,
      page,
      perPage: 25,
    }),
  ]);

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.role) query.set("role", sp.role);
  if (sp.country) query.set("country", sp.country);
  if (sp.status) query.set("status", sp.status);
  const baseHref = `/os/companies${query.toString() ? `?${query}` : ""}`;
  const exportHref = `/os/export?kind=parties&${query.toString()}`;

  return (
    <>
      <PageHead
        title="Firmalar"
        description="Bir firma tek kayıttır. Müşterin aynı zamanda tedarikçinse ikinci kayıt açma — ilişkilerini kartının içinden ekle."
        actions={
          <Link href="/os/companies/new" className={btn.primary}>
            + Firma
          </Link>
        }
      />

      <FilterBar
        action="/os/companies"
        right={<ExcelTools entity="party" entityLabel="Firmalar" exportHref={exportHref} />}
      >
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Ara</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Firma, e-posta, vergi no…" className={`${input} w-56`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">İlişki</span>
          <select name="role" defaultValue={sp.role ?? ""} className={`${input} w-40`}>
            <option value="">Hepsi</option>
            {PARTY_ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {PARTY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Ülke</span>
          <input name="country" defaultValue={sp.country ?? ""} maxLength={2} placeholder="TR" className={`${input} w-20 uppercase`} />
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
            title={sp.q ? "Bu aramaya uyan firma yok" : "Henüz firma yok"}
            description={
              sp.q
                ? "Filtreleri temizleyip tekrar dene."
                : "İlk firmanı ekle, ya da elindeki listeyi Excel'den toplu aktar. Lead Finder'da bulduğun bir firmayı da tek tıkla buraya alabilirsin."
            }
            action={
              <Link href="/os/companies/new" className={btn.primary}>
                + Firma ekle
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Firma</Th>
                  <Th>İlişki</Th>
                  <Th>Ülke / Şehir</Th>
                  <Th align="right">Toplam satış</Th>
                  <Th align="right">Açık alacak</Th>
                  <Th align="right">Açık borç</Th>
                  <Th align="right">Son işlem</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <Tr key={p.id}>
                    <Td className="max-w-[18rem]">
                      <Link href={`/os/companies/${p.id}`} className="font-medium text-foreground hover:underline">
                        {p.name}
                      </Link>
                      {!p.active ? <Badge className="ml-2">Pasif</Badge> : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {p.roles.length === 0 ? (
                          <span className="text-caption text-subtle">—</span>
                        ) : (
                          p.roles.map((r) => (
                            <Badge key={r} tone={r === "CUSTOMER" ? "info" : r === "SUPPLIER" ? "accent" : "neutral"}>
                              {PARTY_ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </Td>
                    <Td className="text-muted">
                      {p.country}
                      {p.city ? ` · ${p.city}` : ""}
                    </Td>
                    <Td align="right" numeric>
                      <Money value={p.salesTotal} currency={settings.baseCurrency} tone={p.salesTotal ? "none" : "muted"} />
                    </Td>
                    <Td align="right" numeric>
                      <Money value={p.openReceivable} currency={settings.baseCurrency} tone={p.openReceivable ? "none" : "muted"} />
                    </Td>
                    <Td align="right" numeric>
                      <Money value={p.openPayable} currency={settings.baseCurrency} tone={p.openPayable ? "none" : "muted"} />
                    </Td>
                    <Td align="right">
                      <DateText value={p.lastActivityAt} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} perPage={data.perPage} total={data.total} baseHref={baseHref} />
          </>
        )}
      </Card>
    </>
  );
}
