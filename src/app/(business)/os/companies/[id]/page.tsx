import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getParty, partyDocuments, partyItems } from "@/server/os/parties";
import { getOsSettings } from "@/server/os/settings";
import { leadOriginFor } from "@/server/os/leadbridge";
import {
  PARTY_ROLE_LABELS, PARTY_ROLE_ORDER, RELATION_STATUS_LABELS, TRADE_MODEL_LABELS, formatMoney,
} from "@/config/os";
import {
  Badge, Card, DateText, Detail, EmptyState, Money, Note, PageHead, Qty,
  StatCard, StatusBadge, Table, Tabs, Td, Th, Tr, btn, input,
} from "@/components/os/ui";
import { removeContactAction, removeRelationAction, saveContactAction, saveRelationAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const party = await getParty(id);
  return { title: `${party?.name ?? "Firma"} · Business OS` };
}

type SP = Promise<{ tab?: string; msg?: string }>;

const TABS = [
  { key: "genel", label: "Genel" },
  { key: "iliskiler", label: "İlişkiler" },
  { key: "kisiler", label: "Kişiler" },
  { key: "satislar", label: "Satışlar" },
  { key: "alislar", label: "Alışlar" },
  { key: "finans", label: "Finans" },
  { key: "urunler", label: "Ürünler" },
];

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : "genel";

  const [party, settings, docs, items, origin] = await Promise.all([
    getParty(id),
    getOsSettings(),
    partyDocuments(id),
    partyItems(id),
    leadOriginFor(id),
  ]);
  if (!party) notFound();

  const cur = settings.baseCurrency;
  const stats = party.stats;
  const usedRoles = new Set(party.relations.map((r) => r.role));
  const availableRoles = PARTY_ROLE_ORDER.filter((r) => !usedRoles.has(r));

  return (
    <>
      <PageHead
        title={party.name}
        description={[party.legalName, party.country, party.city].filter(Boolean).join(" · ")}
        back={{ href: "/os/companies", label: "Firmalar" }}
        actions={
          <>
            <Link href={`/os/sales/new?customerId=${party.id}`} className={btn.primary}>
              Satış ekle
            </Link>
            <Link href={`/os/purchases/new?supplierId=${party.id}`} className={btn.secondary}>
              Alış ekle
            </Link>
            <Link href={`/os/companies/${party.id}/edit`} className={btn.secondary}>
              Düzenle
            </Link>
          </>
        }
      />

      {sp.msg === "archived" ? (
        <div className="mb-5">
          <Note tone="warning">
            Bu firmanın ticari kaydı olduğu için silinmedi, pasife alındı. Geçmiş satış ve kâr
            rakamları olduğu gibi duruyor.
          </Note>
        </div>
      ) : null}
      {!party.active ? (
        <div className="mb-5">
          <Note tone="warning">Bu firma pasif. Yeni belgelerde listelerde çıkmaz.</Note>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Toplam satış" value={formatMoney(stats?.salesTotal ?? 0, cur)} hint={`${stats?.salesCount ?? 0} belge`} />
        <StatCard
          label="Toplam kâr"
          value={formatMoney(stats?.profitTotal ?? 0, cur)}
          tone={(stats?.profitTotal ?? 0) < 0 ? "negative" : "positive"}
        />
        <StatCard
          label="Açık alacak"
          value={formatMoney(stats?.openReceivable ?? 0, cur)}
          tone={(stats?.openReceivable ?? 0) > 0 ? "warning" : "default"}
          href={`/os/payments?direction=IN&partyId=${party.id}`}
        />
        <StatCard
          label="Açık borç"
          value={formatMoney(stats?.openPayable ?? 0, cur)}
          tone={(stats?.openPayable ?? 0) > 0 ? "warning" : "default"}
          href={`/os/payments?direction=OUT&partyId=${party.id}`}
        />
      </div>

      <Tabs items={TABS.map((t) => ({ label: t.label, href: `/os/companies/${id}?tab=${t.key}` }))} current={`/os/companies/${id}?tab=${tab}`} />

      {tab === "genel" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Firma bilgileri">
              <div className="grid gap-5 sm:grid-cols-2">
                <Detail label="Resmi unvan">{party.legalName ?? "—"}</Detail>
                <Detail label="Vergi no">{party.taxNumber ?? "—"}</Detail>
                <Detail label="Vergi dairesi">{party.taxOffice ?? "—"}</Detail>
                <Detail label="Para birimi">{party.currency}</Detail>
                <Detail label="Vade">{party.paymentTermDays ? `${party.paymentTermDays} gün` : "—"}</Detail>
                <Detail label="Telefon">{party.phone ?? "—"}</Detail>
                <Detail label="E-posta">
                  {party.email ? (
                    <a href={`mailto:${party.email}`} className="hover:underline">
                      {party.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label="Web sitesi">
                  {party.website ? (
                    <a href={party.website} target="_blank" rel="noreferrer noopener" className="hover:underline">
                      {party.website.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label="Adres">
                  {[party.address, party.postalCode, party.city, party.country].filter(Boolean).join(", ") || "—"}
                </Detail>
              </div>
              {party.notes ? (
                <div className="mt-5 border-t border-border pt-4">
                  <Detail label="Not">{party.notes}</Detail>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card title="İlişkiler">
              {party.relations.length === 0 ? (
                <p className="text-small text-muted">Henüz ilişki tanımlanmadı.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {party.relations.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-small text-foreground">
                        {PARTY_ROLE_LABELS[r.role] ?? r.role}
                        {r.tradeModel ? (
                          <span className="ml-1.5 text-caption text-subtle">
                            · {TRADE_MODEL_LABELS[r.tradeModel]}
                          </span>
                        ) : null}
                      </span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/os/companies/${id}?tab=iliskiler`} className={`${btn.ghost} mt-3 px-0`}>
                Yönet →
              </Link>
            </Card>

            {/* Provenance — read-only, and tolerant of the lead having changed. */}
            {origin ? (
              <Card title="Nereden geldi">
                <div className="flex flex-col gap-3">
                  <Detail label="Kaynak">Lead Finder</Detail>
                  {origin.lead?.search ? (
                    <Detail label="Arama">
                      {origin.lead.search.countryLabel} · {origin.lead.search.productQuery}
                    </Detail>
                  ) : null}
                  <Detail label="Aktarım tarihi">
                    <DateText value={origin.importedAt} />
                  </Detail>
                  {origin.lead ? (
                    <Link
                      href={`/admin/lead-finder/company/${origin.lead.id}`}
                      className="text-small text-muted hover:underline"
                    >
                      Lead Finder kaydını aç →
                    </Link>
                  ) : (
                    <p className="text-caption text-subtle">
                      Lead Finder kaydı artık mevcut değil. Buradaki bilgiler aktarım anında
                      kopyalandığı için etkilenmedi.
                    </p>
                  )}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "iliskiler" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card padded={false} title="Ticari ilişkiler">
              {party.relations.length === 0 ? (
                <EmptyState
                  title="Henüz ilişki yok"
                  description="Bu firmayla nasıl çalıştığını tanımla: müşteri mi, tedarikçi mi, bayi mi — hepsi aynı anda olabilir."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>İlişki</Th>
                      <Th>Ticari model</Th>
                      <Th>Durum</Th>
                      <Th>Başlangıç</Th>
                      <Th>Not</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {party.relations.map((r) => (
                      <Tr key={r.id}>
                        <Td className="font-medium">{PARTY_ROLE_LABELS[r.role] ?? r.role}</Td>
                        <Td className="text-muted">{r.tradeModel ? TRADE_MODEL_LABELS[r.tradeModel] : "—"}</Td>
                        <Td>
                          <StatusBadge status={r.status} />
                        </Td>
                        <Td>
                          <DateText value={r.startedAt} />
                        </Td>
                        <Td className="max-w-[16rem] truncate text-muted">{r.note ?? "—"}</Td>
                        <Td align="right">
                          <form action={removeRelationAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="partyId" value={party.id} />
                            <button type="submit" className={btn.ghost}>
                              Kaldır
                            </button>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>

          <Card title="İlişki ekle / güncelle">
            <form action={saveRelationAction} className="flex flex-col gap-3">
              <input type="hidden" name="partyId" value={party.id} />
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted">İlişki türü</span>
                <select name="role" required className={input}>
                  {availableRoles.length === 0 ? <option value="">Tüm roller tanımlı</option> : null}
                  {[...availableRoles, ...party.relations.map((r) => r.role)].map((r) => (
                    <option key={r} value={r}>
                      {PARTY_ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted">Ticari model</span>
                <select name="tradeModel" className={input}>
                  <option value="">Belirtilmedi</option>
                  {Object.entries(TRADE_MODEL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted">Durum</span>
                <select name="status" defaultValue="ACTIVE" className={input}>
                  {Object.entries(RELATION_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted">Başlangıç</span>
                <input type="date" name="startedAt" className={input} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted">Not</span>
                <textarea name="note" rows={2} className={input} placeholder="Örn. stoksuz satış, aylık kapanış" />
              </label>
              <button type="submit" className={btn.primary}>
                Kaydet
              </button>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === "kisiler" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card padded={false} title="Kişiler">
              {party.contacts.length === 0 ? (
                <EmptyState title="Kişi yok" description="Bu firmada kiminle konuştuğunu buraya ekle." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Ad Soyad</Th>
                      <Th>Görev</Th>
                      <Th>E-posta</Th>
                      <Th>Telefon</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {party.contacts.map((c) => (
                      <Tr key={c.id}>
                        <Td className="font-medium">
                          {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                          {c.isPrimary ? <Badge tone="accent" className="ml-2">Birincil</Badge> : null}
                        </Td>
                        <Td className="text-muted">{c.title ?? "—"}</Td>
                        <Td className="text-muted">
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="hover:underline">
                              {c.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td className="text-muted">{c.phone ?? "—"}</Td>
                        <Td align="right">
                          <form action={removeContactAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="partyId" value={party.id} />
                            <button type="submit" className={btn.ghost}>
                              Sil
                            </button>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>

          <Card title="Kişi ekle">
            <form action={saveContactAction} className="flex flex-col gap-3">
              <input type="hidden" name="partyId" value={party.id} />
              <input name="firstName" required placeholder="Ad *" className={input} />
              <input name="lastName" placeholder="Soyad" className={input} />
              <input name="title" placeholder="Görev" className={input} />
              <input name="email" type="email" placeholder="E-posta" className={input} />
              <input name="phone" placeholder="Telefon" className={input} />
              <label className="flex items-center gap-2.5 text-small text-muted">
                <input type="checkbox" name="isPrimary" className="size-4 rounded border-border" />
                Birincil kişi
              </label>
              <button type="submit" className={btn.primary}>
                Ekle
              </button>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === "satislar" ? (
        <Card padded={false} title="Satışlar" actions={<Link href={`/os/sales?customerId=${id}`} className={btn.ghost}>Tümü →</Link>}>
          {docs.sales.length === 0 ? (
            <EmptyState title="Bu firmaya satış yok" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Belge</Th>
                  <Th>Tarih</Th>
                  <Th>Kanal</Th>
                  <Th align="right">Tutar</Th>
                  <Th align="right">Kâr</Th>
                  <Th align="right">Durum</Th>
                </tr>
              </thead>
              <tbody>
                {docs.sales.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <Link href={`/os/sales/${s.id}`} className="font-medium hover:underline">
                        {s.code}
                      </Link>
                    </Td>
                    <Td><DateText value={s.issuedAt} /></Td>
                    <Td className="text-muted">{s.channelName ?? "—"}</Td>
                    <Td align="right" numeric><Money value={s.total} currency={s.currency} /></Td>
                    <Td align="right" numeric><Money value={s.profit} currency={cur} tone="auto" /></Td>
                    <Td align="right"><StatusBadge status={s.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "alislar" ? (
        <Card padded={false} title="Alışlar" actions={<Link href={`/os/purchases?supplierId=${id}`} className={btn.ghost}>Tümü →</Link>}>
          {docs.purchases.length === 0 ? (
            <EmptyState title="Bu firmadan alış yok" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Belge</Th>
                  <Th>Tarih</Th>
                  <Th align="right">Tutar</Th>
                  <Th align="right">Durum</Th>
                </tr>
              </thead>
              <tbody>
                {docs.purchases.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/os/purchases/${p.id}`} className="font-medium hover:underline">
                        {p.code}
                      </Link>
                    </Td>
                    <Td><DateText value={p.issuedAt} /></Td>
                    <Td align="right" numeric><Money value={p.total} currency={p.currency} /></Td>
                    <Td align="right"><StatusBadge status={p.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "finans" ? (
        <Card padded={false} title="Ödeme ve tahsilatlar">
          {docs.payments.length === 0 ? (
            <EmptyState title="Açık kayıt yok" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Yön</Th>
                  <Th>Belge</Th>
                  <Th align="right">Tutar</Th>
                  <Th align="right">Ödenen</Th>
                  <Th>Vade</Th>
                  <Th align="right">Durum</Th>
                </tr>
              </thead>
              <tbody>
                {docs.payments.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Badge tone={p.direction === "IN" ? "success" : "warning"}>
                        {p.direction === "IN" ? "Tahsilat" : "Ödeme"}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{p.docCode ?? "—"}</Td>
                    <Td align="right" numeric><Money value={p.amount} currency={p.currency} /></Td>
                    <Td align="right" numeric><Money value={p.paidAmount} currency={p.currency} tone="muted" /></Td>
                    <Td><DateText value={p.dueDate} /></Td>
                    <Td align="right"><StatusBadge status={p.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "urunler" ? (
        <Card
          padded={false}
          title="Bu firmayla alınıp satılan ürünler"
          description="Elle tutulan bir liste değil — belgelerden türetiliyor."
        >
          {items.length === 0 ? (
            <EmptyState title="Henüz ürün hareketi yok" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Ürün</Th>
                  <Th align="right">Satılan</Th>
                  <Th align="right">Alınan</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <Tr key={i.itemId}>
                    <Td className="font-mono text-caption text-muted">{i.sku}</Td>
                    <Td>
                      <Link href={`/os/products/${i.itemId}`} className="hover:underline">
                        {i.name}
                      </Link>
                    </Td>
                    <Td align="right" numeric><Qty value={i.soldQty} unit={i.unit} /></Td>
                    <Td align="right" numeric><Qty value={i.boughtQty} unit={i.unit} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}
    </>
  );
}
