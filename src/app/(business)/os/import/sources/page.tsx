import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Badge, Card, Note, PageHead, Table, Td, Th, Tr, btn } from "@/components/os/ui";
import { checkImportSourcesAction } from "../actions";

export const metadata: Metadata = { title: "İthalat kaynakları · Business OS" };
export const dynamic = "force-dynamic";

export default async function ImportSources() {
  const rows = await db.importSource.findMany({
    where: { NOT: { key: { startsWith: "WEB:" } } },
    orderBy: [{ isCurrent: "desc" }, { tier: "asc" }, { key: "asc" }, { fetchedAt: "desc" }],
    select: {
      id: true, key: true, name: true, publisher: true, tier: true, url: true, status: true, fetchedAt: true, lastCheckedAt: true,
      version: true, contentHash: true, consolidatedAsOf: true, isCurrent: true, error: true, extractionMethod: true,
      _count: { select: { tariffLines: true, rules: true } },
    },
  });
  const web = await db.importSource.count({ where: { key: { startsWith: "WEB:" } } });

  return (
    <>
      <PageHead
        title="İthalat kaynakları"
        description="Sistemin kullandığı her resmi / ücretsiz kaynak, sürümü ve özetiyle. Kaynaklar içerik özetine (sha256) göre sürümlenir; eski sürümler ve onlara dayanan analizler silinmez."
        back={{ href: "/os/import", label: "İthalat" }}
        actions={
          <form action={checkImportSourcesAction}>
            <button type="submit" className={btn.primary}>Değişiklik kontrolü yap</button>
          </form>
        }
      />
      <div className="mb-4">
        <Note>
          Değişiklik kontrolü her resmi dosyayı yeniden indirir ve yüklü sürümle bayt bazında karşılaştırır. Değişen kaynak "KAYNAK DEĞİŞTİ" olarak işaretlenir;
          yeni sürüm <code>npx tsx scripts/import-intelligence/ingest.ts</code> ile içe aktarılana kadar eski sürüm kullanılmaya devam eder. Web önbelleğindeki ürün sayfası: {web}.
        </Note>
      </div>
      <Card padded={false}>
        <Table stacked>
          <thead>
            <tr><Th>Kaynak</Th><Th>Tier</Th><Th>Durum</Th><Th>Satır / kural</Th><Th>Alındı / kontrol</Th><Th>Sürüm</Th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Tr key={s.id} className={s.isCurrent ? undefined : "opacity-60"}>
                <Td label="Kaynak">
                  {s.url ? <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
                  <div className="text-caption text-subtle">{s.publisher} · {s.key}{s.isCurrent ? "" : " · eski sürüm"}</div>
                  {s.extractionMethod ? <div className="text-caption text-subtle">Çıkarım: {s.extractionMethod}</div> : null}
                  {s.error ? <div className="text-caption text-warning">{s.error}</div> : null}
                </Td>
                <Td label="Tier">{s.tier}</Td>
                <Td label="Durum">
                  <Badge tone={s.status === "OK" ? "success" : s.status === "MANUAL_ONLY" ? "info" : "danger"}>
                    {s.status === "OK" ? "ERİŞİLDİ" : s.status === "MANUAL_ONLY" ? "ELLE KONTROL" : s.status === "CHANGED" ? "KAYNAK DEĞİŞTİ" : s.status === "PARSE_FAILED" ? "OKUNAMADI" : "KAYNAĞA ERİŞİLEMEDİ"}
                  </Badge>
                </Td>
                <Td label="Satır / kural" numeric>{s._count.tariffLines ? `${s._count.tariffLines.toLocaleString("tr-TR")} satır` : ""}{s._count.rules ? `${s._count.rules.toLocaleString("tr-TR")} kural` : ""}{!s._count.tariffLines && !s._count.rules ? "—" : ""}</Td>
                <Td label="Alındı / kontrol" className="text-caption">{s.fetchedAt?.toISOString().slice(0, 10) ?? "—"} / {s.lastCheckedAt?.toISOString().slice(0, 10) ?? "—"}</Td>
                <Td label="Sürüm" className="text-caption">
                  {s.version ?? "—"}{s.consolidatedAsOf ? ` · konsolide ${s.consolidatedAsOf.toISOString().slice(0, 10)}` : ""}
                  <div className="text-subtle">{s.contentHash ? `sha256 ${s.contentHash.slice(0, 12)}…` : ""}</div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
