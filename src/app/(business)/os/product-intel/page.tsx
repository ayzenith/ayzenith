import type { Metadata } from "next";
import Link from "next/link";

import { MARKETPLACES, marketplaceMeta } from "@/config/product-intel";
import { listAnalyses } from "@/server/product-intel/repo";
import { ANALYSIS_STATUS_LABELS, type AnalysisStatus } from "@/server/product-intel/types";
import {
  Badge,
  Card,
  DateText,
  EmptyState,
  Field,
  FilterBar,
  Note,
  PageHead,
  Pagination,
  Table,
  Td,
  Th,
  Tr,
  btn,
  input,
  type BadgeTone,
} from "@/components/os/ui";

export const metadata: Metadata = { title: "Ürün Analizi · Business OS" };
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

const STATUS_TONE: Record<AnalysisStatus, BadgeTone> = {
  OK: "success",
  INSUFFICIENT_DATA: "warning",
  BLOCKED: "danger",
};

function confidenceTone(score: number): BadgeTone {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

export default async function ProductIntelList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? null;
  const page = Math.max(1, Number(one("page")) || 1);
  const marketplace = one("marketplace");
  const status = one("status");
  const q = one("q");

  const { rows, total } = await listAnalyses({ page, perPage: PER_PAGE, marketplace, status, q });

  const query = new URLSearchParams();
  if (marketplace) query.set("marketplace", marketplace);
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  const baseHref = `/os/product-intel${query.toString() ? `?${query}` : ""}`;

  return (
    <>
      <PageHead
        title="Ürün Analizi"
        description="Bir ürünü pazaryerinde satmadan önce: rakip ve fiyat analizi, ürün fırsatları, gerçek maliyetine dayalı fiyat bandı, başlık önerileri ve giriş planı."
        actions={
          <Link href="/os/product-intel/new" className={btn.primary}>
            Yeni analiz
          </Link>
        }
      />

      <div className="mb-4">
        <Note>
          Bu sürümde pazaryeri otomatik taranmaz. Rakip verisini Excel/CSV yükleyerek, listeyi yapıştırarak veya tek tek
          ürün adresi vererek girersin — sistem yalnızca gerçekten okuduğu veriyle konuşur.
        </Note>
      </div>

      <FilterBar action="/os/product-intel">
        <Field label="Ara">
          <input name="q" defaultValue={q ?? ""} className={input} placeholder="Ürün adı" />
        </Field>
        <Field label="Pazaryeri">
          <select name="marketplace" defaultValue={marketplace ?? ""} className={input}>
            <option value="">Hepsi</option>
            {MARKETPLACES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Durum">
          <select name="status" defaultValue={status ?? ""} className={input}>
            <option value="">Hepsi</option>
            {(Object.keys(ANALYSIS_STATUS_LABELS) as AnalysisStatus[]).map((s) => (
              <option key={s} value={s}>
                {ANALYSIS_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>

      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            title="Henüz analiz yok"
            description="Satmayı düşündüğün bir ürünü gir, rakip verisini yapıştır; sistem fiyat bandını ve fırsatları çıkarsın."
            action={
              <Link href="/os/product-intel/new" className={btn.primary}>
                İlk analizi oluştur
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <Tr>
                  <Th>Kod</Th>
                  <Th>Ürün</Th>
                  <Th>Pazaryeri</Th>
                  <Th align="right">Rakip</Th>
                  <Th align="right">Veri güveni</Th>
                  <Th>Durum</Th>
                  <Th>Tarih</Th>
                </Tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/os/product-intel/${r.id}`} className="font-medium text-foreground hover:underline">
                        {r.code}
                      </Link>
                    </Td>
                    <Td>{r.productName}</Td>
                    <Td>
                      {marketplaceMeta(r.marketplace).label}
                      <span className="ml-1 text-subtle">{r.marketCountry}</span>
                    </Td>
                    <Td align="right">{r.offerCount}</Td>
                    <Td align="right">
                      <Badge tone={confidenceTone(r.dataConfidence)}>%{r.dataConfidence}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{ANALYSIS_STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </Td>
                    <Td>
                      <DateText value={r.createdAt} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} perPage={PER_PAGE} total={total} baseHref={baseHref} />
          </>
        )}
      </Card>
    </>
  );
}
