import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { marketplaceMeta } from "@/config/product-intel";
import { PROVENANCE_LABELS, type Provenance } from "@/server/import/types";
import { getAnalysis, type StoredAnalysis } from "@/server/product-intel/repo";
import { GAP_BAND_LABELS, type GapFinding } from "@/server/product-intel/gap";
import { PRICE_BAND_DESCRIPTIONS, PRICE_BAND_LABELS, type PriceBand } from "@/server/product-intel/price";
import { ANALYSIS_STATUS_LABELS, EVIDENCE_AREA_LABELS, SCAN_STATUS_LABELS, type AnalysisStatus } from "@/server/product-intel/types";
import {
  Badge,
  Card,
  DateText,
  Detail,
  EmptyState,
  Note,
  PageHead,
  StatCard,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
  btn,
  type BadgeTone,
} from "@/components/os/ui";
import { deleteAnalysisAction } from "../actions";

export const metadata: Metadata = { title: "Ürün analizi · Business OS" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "ozet", label: "Özet" },
  { key: "pazar", label: "Pazar" },
  { key: "rakipler", label: "Rakipler" },
  { key: "firsatlar", label: "Fırsatlar" },
  { key: "fiyat", label: "Fiyat" },
  { key: "baslik", label: "Başlık" },
  { key: "swot", label: "SWOT" },
  { key: "launch", label: "Giriş Planı" },
  { key: "kaynaklar", label: "Kaynaklar" },
] as const;

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

const STATUS_TONE: Record<AnalysisStatus, BadgeTone> = { OK: "success", INSUFFICIENT_DATA: "warning", BLOCKED: "danger" };
const PROV_TONE: Record<Provenance, BadgeTone> = {
  OFFICIAL: "success",
  AI_PREDICTED: "warning",
  USER_ENTERED: "info",
  CALCULATED: "neutral",
  WEB_EXTRACTED: "accent",
  INFERRED: "neutral",
  UNKNOWN: "danger",
};
const BAND_TONE: Record<PriceBand, BadgeTone> = { RED: "danger", YELLOW: "warning", GREEN: "success", GRAY: "neutral" };
const GAP_TONE: Record<string, BadgeTone> = {
  NOT_OBSERVED: "success",
  RARE: "success",
  MINORITY: "info",
  COMMON: "neutral",
  INSUFFICIENT_DATA: "warning",
};

function Prov({ p }: { p: Provenance }) {
  return <Badge tone={PROV_TONE[p] ?? "neutral"}>{PROVENANCE_LABELS[p] ?? p}</Badge>;
}

/** Every derived claim can be opened to its measurement. */
function Why({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-1.5 rounded-lg border border-border bg-surface-sunken/60 px-3 py-2">
      <summary className="cursor-pointer text-caption font-medium text-foreground">Dayanağı</summary>
      <div className="mt-1.5 text-caption text-muted">{children}</div>
    </details>
  );
}

export default async function ProductAnalysisDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = String((Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "ozet");
  const a = await getAnalysis(id);
  if (!a) notFound();

  const meta = marketplaceMeta(a.marketplace);
  const base = `/os/product-intel/${a.id}`;

  return (
    <>
      <PageHead
        title={a.productName}
        description={`${a.code} · ${meta.label} (${a.marketCountry}) · ${a.market?.offerCount ?? 0} rakip ilan`}
        back={{ href: "/os/product-intel", label: "Ürün Analizi" }}
        actions={
          <form action={deleteAnalysisAction}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className={btn.danger}>
              Sil
            </button>
          </form>
        }
      />

      {a.status !== "OK" ? (
        <div className="mb-4">
          <Note tone="warning">
            {a.status === "BLOCKED"
              ? "Hiçbir kaynaktan veri alınamadı. Kaynaklar sekmesinde her denemenin sonucu duruyor — bu, pazarda ürün olmadığı anlamına GELMEZ."
              : "Veri yetersiz: pazar profili için gereken en az rakip sayısına ulaşılamadı. Aşağıdaki rakamlar gösteriliyor ama karar dayanağı değildir."}
          </Note>
        </div>
      ) : null}

      <Tabs items={TABS.map((t) => ({ label: t.label, href: `${base}?tab=${t.key}` }))} current={`${base}?tab=${tab}`} />

      {tab === "ozet" ? <Ozet a={a} /> : null}
      {tab === "pazar" ? <Pazar a={a} /> : null}
      {tab === "rakipler" ? <Rakipler a={a} /> : null}
      {tab === "firsatlar" ? <Firsatlar a={a} /> : null}
      {tab === "fiyat" ? <Fiyat a={a} /> : null}
      {tab === "baslik" ? <Baslik a={a} /> : null}
      {tab === "swot" ? <SwotTab a={a} /> : null}
      {tab === "launch" ? <LaunchTab a={a} /> : null}
      {tab === "kaynaklar" ? <Kaynaklar a={a} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function Ozet({ a }: { a: StoredAnalysis }) {
  const price = a.price;
  const scope = a.scanScope;
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Veri güveni"
          value={`%${a.dataConfidence}`}
          hint={`${scope?.offersUsed ?? 0} ilan, ${scope?.offersWithPrice ?? 0} fiyatlı`}
          tone={a.dataConfidence >= 70 ? "positive" : a.dataConfidence >= 40 ? "warning" : "negative"}
        />
        <StatCard
          label="Başabaş fiyat"
          value={price?.minProfitablePrice != null ? `${fmt(price.minProfitablePrice)} ${a.market?.currency ?? ""}` : "—"}
          hint={price?.costBasis?.label ?? "Maliyet yok"}
          tone={price?.status === "OK" ? "default" : "negative"}
        />
        <StatCard
          label="Hedef marj fiyatı"
          value={price?.targetPrice != null ? `${fmt(price.targetPrice)} ${a.market?.currency ?? ""}` : "—"}
          hint={price?.inputs ? `%${price.inputs.targetMarginPct} marj` : ""}
        />
        <StatCard
          label="Pazar medyanı"
          value={a.market?.priceStats ? `${fmt(a.market.priceStats.median)} ${a.market.currency}` : "—"}
          hint={a.market?.priceStats ? `${a.market.priceStats.count} ilandan` : "Fiyat okunamadı"}
        />
      </div>

      <Card title="Yorum" description="AI yorumu — ölçümleri açıklar, ölçüm üretmez.">
        {a.aiSummary ? (
          <div className="whitespace-pre-wrap text-small text-foreground">{a.aiSummary}</div>
        ) : (
          <Note tone="warning">{a.aiDisabledNote ?? "Yorum üretilmedi."}</Note>
        )}
      </Card>

      <Card title="Analiz künyesi">
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="Durum">
            <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{ANALYSIS_STATUS_LABELS[a.status] ?? a.status}</Badge>
          </Detail>
          <Detail label="Tarih">
            <DateText value={a.createdAt} />
          </Detail>
          <Detail label="Maliyet tabanı">
            {a.price?.costBasis ? (
              <span className="inline-flex items-center gap-1.5">
                {a.price.costBasis.label}
                <Prov p={a.price.costBasis.provenance} />
              </span>
            ) : (
              "—"
            )}
          </Detail>
          <Detail label="Bağlı ürün">
            {a.itemId ? <Link href={`/os/products/${a.itemId}`} className="hover:underline">{a.itemSku} — {a.itemName}</Link> : "—"}
          </Detail>
          <Detail label="İthalat analizi">
            {a.importCaseId ? <Link href={`/os/import/${a.importCaseId}`} className="hover:underline">{a.importCaseCode}</Link> : "—"}
          </Detail>
          <Detail label="Kanal">{a.channelName ?? "—"}</Detail>
        </div>
      </Card>

      <Card title="Veri güveni neden bu?" description="Puan koddan gelir; yorum değildir.">
        <Table>
          <thead>
            <Tr>
              <Th>Bileşen</Th>
              <Th align="right">Puan</Th>
              <Th>Açıklama</Th>
            </Tr>
          </thead>
          <tbody>
            {(a.market ? confidenceRows(a) : []).map((c) => (
              <Tr key={c.key}>
                <Td>{c.label}</Td>
                <Td align="right">
                  {c.points} / {c.maxPoints}
                </Td>
                <Td>{c.note}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/** The confidence breakdown is not stored separately — it is reconstructed
 *  from the frozen figures so the overview can explain its own number. */
function confidenceRows(a: StoredAnalysis) {
  const scope = a.scanScope;
  const readable = a.gapFindings.filter((g) => g.readableCount > 0);
  const avgReadable =
    a.gapFindings.length === 0 || (scope?.offersUsed ?? 0) === 0
      ? 0
      : Math.round((readable.reduce((s, g) => s + g.readableCount / scope.offersUsed, 0) / a.gapFindings.length) * 100);
  return [
    { key: "SAMPLE", label: "Örneklem büyüklüğü", points: Math.min(40, Math.round(((scope?.offersUsed ?? 0) / 30) * 40)), maxPoints: 40, note: `${scope?.offersUsed ?? 0} rakip ilan okundu.` },
    { key: "PRICE", label: "Fiyat okunabilirliği", points: Math.round(((scope?.offersWithPrice ?? 0) / Math.max(1, scope?.offersUsed ?? 0)) * 25), maxPoints: 25, note: `${scope?.offersWithPrice ?? 0} ilanda fiyat okunabildi.` },
    { key: "FACET", label: "Özellik okunabilirliği", points: Math.round((avgReadable / 100) * 20), maxPoints: 20, note: `${a.gapFindings.length} özellikte ortalama %${avgReadable} okunabilirlik.` },
    { key: "COST", label: "Maliyet tabanı", points: a.price?.costBasis?.kind === "AVERAGE_COST" ? 15 : a.price?.costBasis?.kind === "LANDED_COST" ? 12 : a.price?.costBasis?.kind === "USER_ASSUMPTION" ? 6 : 0, maxPoints: 15, note: a.price?.costBasis?.label ?? "Maliyet yok" },
  ];
}

function Pazar({ a }: { a: StoredAnalysis }) {
  const m = a.market;
  if (!m || m.offerCount === 0) return <EmptyState title="Pazar verisi yok" description="Rakip ilan girilmediği için pazar profili çıkarılamadı." />;
  return (
    <div className="grid gap-5">
      {m.notes.length > 0 ? (
        <div className="grid gap-2">
          {m.notes.map((n, i) => (
            <Note key={i} tone="warning">
              {n}
            </Note>
          ))}
        </div>
      ) : null}

      {m.priceStats ? (
        <Card title="Fiyat dağılımı" description={`Fiyatı okunabilen ${m.priceStats.count} ilandan, ${m.currency}.`}>
          <div className="grid gap-3 sm:grid-cols-5">
            <Detail label="En düşük">{fmt(m.priceStats.min)}</Detail>
            <Detail label="Alt çeyrek">{fmt(m.priceStats.p25)}</Detail>
            <Detail label="Medyan">{fmt(m.priceStats.median)}</Detail>
            <Detail label="Üst çeyrek">{fmt(m.priceStats.p75)}</Detail>
            <Detail label="En yüksek">{fmt(m.priceStats.max)}</Detail>
          </div>
        </Card>
      ) : null}

      {m.segments.length > 0 ? (
        <Card title="Fiyat segmentleri" description="Bantlar gözlenen dağılımdan çıkarıldı; her bantta gerçek ilan var." padded={false}>
          <Table>
            <thead>
              <Tr>
                <Th>Segment</Th>
                <Th align="right">Aralık</Th>
                <Th align="right">İlan</Th>
                <Th align="right">Pay</Th>
              </Tr>
            </thead>
            <tbody>
              {m.segments.map((s) => (
                <Tr key={s.key}>
                  <Td>{s.label}</Td>
                  <Td align="right">
                    {fmt(s.from)} – {fmt(s.to)}
                  </Td>
                  <Td align="right">{s.count}</Td>
                  <Td align="right">%{s.pct}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Satıcılar" description={m.sellerConcentrationPct != null ? `En büyük üç satıcı: %${m.sellerConcentrationPct}` : undefined} padded={false}>
          {m.sellers.length === 0 ? (
            <EmptyState title="Satıcı bilgisi yok" description="Girilen veride satıcı sütunu bulunmadı." />
          ) : (
            <Table>
              <thead>
                <Tr>
                  <Th>Satıcı</Th>
                  <Th align="right">İlan</Th>
                  <Th align="right">Pay</Th>
                </Tr>
              </thead>
              <tbody>
                {m.sellers.slice(0, 10).map((s) => (
                  <Tr key={s.value}>
                    <Td>{s.value}</Td>
                    <Td align="right">{s.count}</Td>
                    <Td align="right">%{s.pct}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Markalar" padded={false}>
          {m.brands.length === 0 ? (
            <EmptyState title="Marka bilgisi yok" description="Girilen veride marka sütunu bulunmadı." />
          ) : (
            <Table>
              <thead>
                <Tr>
                  <Th>Marka</Th>
                  <Th align="right">İlan</Th>
                  <Th align="right">Pay</Th>
                </Tr>
              </thead>
              <tbody>
                {m.brands.slice(0, 10).map((b) => (
                  <Tr key={b.value}>
                    <Td>{b.value}</Td>
                    <Td align="right">{b.count}</Td>
                    <Td align="right">%{b.pct}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {m.facets.length > 0 ? (
        <Card title="Pazarda okunan özellikler" description="Her satırın paydası, o özelliği gerçekten yazan ilan sayısıdır.">
          <div className="grid gap-3">
            {m.facets.map((f) => (
              <div key={f.key} className="border-b border-border pb-2 last:border-0">
                <div className="mb-1 text-caption font-medium text-foreground">
                  {f.label} <span className="text-subtle">— {f.readableCount} ilanda okunabildi</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {f.values.map((v) => (
                    <Badge key={v.value} tone="neutral">
                      {v.value} · {v.count} (%{v.pct})
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {m.rating ? (
        <Card title="Puan ve yorum">
          <div className="grid gap-4 sm:grid-cols-4">
            <Detail label="Puanı olan ilan">{m.rating.ratedCount}</Detail>
            <Detail label="Ortalama puan">{fmt(m.rating.avgRating, 2)}</Detail>
            <Detail label="Yorum medyanı">{m.rating.medianReviewCount}</Detail>
            <Detail label="En yüksek yorum">{m.rating.maxReviewCount}</Detail>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Rakipler({ a }: { a: StoredAnalysis }) {
  if (a.offers.length === 0) return <EmptyState title="Rakip ilan yok" description="Bu analize rakip verisi girilmemiş." />;
  return (
    <Card padded={false} title={`${a.offers.length} rakip ilan`} description="Her satır, girildiği andaki bir teklifi gösterir — ürünü değil.">
      <Table>
        <thead>
          <Tr>
            <Th>#</Th>
            <Th>Başlık</Th>
            <Th>Marka</Th>
            <Th>Satıcı</Th>
            <Th align="right">Fiyat</Th>
            <Th align="right">Puan</Th>
            <Th align="right">Yorum</Th>
            <Th>Kaynak</Th>
          </Tr>
        </thead>
        <tbody>
          {a.offers.map((o) => (
            <Tr key={o.id}>
              <Td>{o.rank}</Td>
              <Td>{o.title}</Td>
              <Td>{o.brand ?? "—"}</Td>
              <Td>{o.sellerName ?? "—"}</Td>
              <Td align="right">{o.price == null ? "—" : `${fmt(o.price)} ${o.currency}`}</Td>
              <Td align="right">{o.ratingAvg == null ? "—" : fmt(o.ratingAvg, 1)}</Td>
              <Td align="right">{o.ratingCount ?? "—"}</Td>
              <Td>
                {o.sourceUrl ? (
                  <a href={o.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-info hover:underline">
                    aç
                  </a>
                ) : (
                  <Prov p={o.provenance as Provenance} />
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Firsatlar({ a }: { a: StoredAnalysis }) {
  if (a.gapFindings.length === 0) {
    return (
      <EmptyState
        title="Karşılaştırma yapılamadı"
        description="Ürününüzden karşılaştırılabilir teknik özellik okunamadı. Teknik özellikleri girip analizi tekrar çalıştırın."
      />
    );
  }
  return (
    <div className="grid gap-4">
      <Note>
        Her oranın paydası, o özelliği <strong>gerçekten yazan</strong> ilan sayısıdır — taranan tüm ilanlar değil.
        Okunamayan bir ilan &quot;bu özellik yok&quot; sayılmaz.
      </Note>
      {a.gapFindings.map((g: GapFinding) => (
        <Card key={g.facetKey}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small font-semibold text-foreground">{g.label}</span>
                <Badge tone="info">{g.ourValue}</Badge>
                <Badge tone={GAP_TONE[g.band] ?? "neutral"}>{GAP_BAND_LABELS[g.band]}</Badge>
              </div>
              <p className="mt-1.5 text-small text-muted">{g.scopeSentence}</p>
            </div>
            <div className="text-right">
              <p className="font-sans text-h5 font-semibold tabular-nums text-foreground">
                {g.coveragePct == null ? "—" : `%${g.coveragePct}`}
              </p>
              <p className="text-caption text-subtle">
                {g.matchCount}/{g.readableCount}
              </p>
            </div>
          </div>

          {g.otherValues.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-caption text-subtle">Rakiplerde bunun yerine:</p>
              <div className="flex flex-wrap gap-1.5">
                {g.otherValues.map((v) => (
                  <Badge key={v.value} tone="neutral">
                    {v.value} · {v.count} (%{v.pct})
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <Why>
            Taranan ilan: {g.totalOffers} · Bu özellikten bahseden: {g.mentionedCount} · Değeri okunabilen:{" "}
            {g.readableCount} · Bizimle eşleşen: {g.matchCount}
            {g.kind === "NUMERIC_HIGHER_BETTER" ? " (bizim değerimize eşit veya üzeri)" : ""}
          </Why>
        </Card>
      ))}
    </div>
  );
}

function Fiyat({ a }: { a: StoredAnalysis }) {
  const p = a.price;
  if (!p) return <EmptyState title="Fiyat hesaplanmadı" />;
  const cur = a.market?.currency ?? "";

  if (p.status !== "OK") {
    return (
      <div className="grid gap-4">
        <Note tone="warning">{p.costBasis?.note}</Note>
        {p.warnings?.map((w, i) => (
          <Note key={i} tone="warning">
            {w}
          </Note>
        ))}
        <Card title="Ne yapmalı?">
          <ul className="list-inside list-disc text-small text-muted">
            <li>Ürünü stoktaki bir SKU&apos;ya bağla — gerçek ortalama maliyet kullanılır.</li>
            <li>Ya da bir ithalat analizine bağla — iniş maliyeti kullanılır.</li>
            <li>Ya da hedef alış maliyetini gir — varsayım olarak işaretlenerek kullanılır.</li>
          </ul>
        </Card>
      </div>
    );
  }

  // Warnings about the COST basis belong next to the cost, not stacked at the
  // top with the pricing ones — otherwise the assumption notice is printed
  // twice, once as the banner and once again in the list.
  const costWarnings = p.costBasis.warnings ?? [];
  const priceWarnings = (p.warnings ?? []).filter((w) => !costWarnings.includes(w));

  return (
    <div className="grid gap-5">
      {p.costBasis.isAssumption ? (
        <Note tone="warning">
          Bu sayfadaki tüm fiyat ve marj sonuçları <strong>ölçülmemiş bir maliyet varsayımına</strong> dayanıyor.
        </Note>
      ) : null}
      {priceWarnings.map((w, i) => (
        <Note key={i} tone="warning">
          {w}
        </Note>
      ))}

      <Card title="Birim maliyet" description={`${p.costBasis.label} — ${p.costBasis.note}`} padded={false}>
        <Table>
          <thead>
            <Tr>
              <Th>Kalem</Th>
              <Th align="right">Tutar ({cur})</Th>
              <Th>Not</Th>
            </Tr>
          </thead>
          <tbody>
            {p.breakdown.map((b) => (
              <Tr key={b.key}>
                <Td>{b.label}</Td>
                <Td align="right">{fmt(b.amount)}</Td>
                <Td>{b.note}</Td>
              </Tr>
            ))}
            <Tr>
              <Td>
                <strong>Toplam birim maliyet</strong>
              </Td>
              <Td align="right">
                <strong>{fmt(p.fixedPerUnit)}</strong>
              </Td>
              <Td>Komisyon ve KDV fiyata bağlı olduğu için burada değil, aşağıdaki bantlarda.</Td>
            </Tr>
          </tbody>
        </Table>
        {costWarnings.length > 0 ? (
          <div className="grid gap-2 border-t border-border p-5">
            {costWarnings.map((w, i) => (
              <Note key={i} tone="warning">
                {w}
              </Note>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Fiyat bantları" description={p.notes?.join(" ")}>
        <div className="grid gap-2">
          {p.bands.map((b) => (
            <div key={b.band} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Badge tone={BAND_TONE[b.band]}>{PRICE_BAND_LABELS[b.band]}</Badge>
                <span className="text-caption text-muted">{PRICE_BAND_DESCRIPTIONS[b.band]}</span>
              </div>
              <span className="tabular-nums text-small text-foreground">
                {b.from == null ? "≤" : fmt(b.from)} {b.from != null && b.to != null ? "–" : ""} {b.to == null ? (b.from == null ? fmt(b.to) : "↑") : fmt(b.to)} {cur}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Senaryolar" description="Rakip fiyat noktaları kendi maliyet bandının üzerine yerleştirildi." padded={false}>
        <Table>
          <thead>
            <Tr>
              <Th>Nokta</Th>
              <Th align="right">Fiyat</Th>
              <Th align="right">Net gelir</Th>
              <Th align="right">Komisyon</Th>
              <Th align="right">Birim kâr</Th>
              <Th align="right">Marj</Th>
              <Th>Bant</Th>
            </Tr>
          </thead>
          <tbody>
            {p.scenarios.map((s) => (
              <Tr key={`${s.key}-${s.price}`}>
                <Td>{s.label}</Td>
                <Td align="right">{fmt(s.price)}</Td>
                <Td align="right">{fmt(s.netRevenue)}</Td>
                <Td align="right">{fmt(s.commission)}</Td>
                <Td align="right">{fmt(s.profit)}</Td>
                <Td align="right">%{fmt(s.marginPct, 1)}</Td>
                <Td>
                  <Badge tone={BAND_TONE[s.band]}>{PRICE_BAND_LABELS[s.band]}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Kullanılan varsayımlar">
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="KDV">%{fmt(p.inputs.vatRatePct, 1)}</Detail>
          <Detail label="Komisyon">
            %{fmt(p.inputs.commissionPct, 2)} ({p.inputs.commissionBase === "GROSS" ? "KDV dahil fiyat üzerinden" : "net tutar üzerinden"})
          </Detail>
          <Detail label="Hedef marj">%{fmt(p.inputs.targetMarginPct, 1)}</Detail>
          <Detail label="Kargo">{fmt(p.inputs.shipping)} {cur}</Detail>
          <Detail label="Paketleme">{fmt(p.inputs.packaging)} {cur}</Detail>
          <Detail label="İade oranı">%{fmt(p.inputs.returnRatePct, 1)}</Detail>
        </div>
      </Card>
    </div>
  );
}

function Baslik({ a }: { a: StoredAnalysis }) {
  if (a.titles.length === 0) {
    return <EmptyState title="Başlık önerisi yok" description={a.aiDisabledNote ?? "Veri yetersiz olduğu için başlık üretilmedi."} />;
  }
  const accepted = a.titles.filter((t) => t.accepted);
  const rejected = a.titles.filter((t) => !t.accepted);
  return (
    <div className="grid gap-5">
      <Note>
        Başlıklar AI tarafından yazılır, ardından <strong>kod tarafından denetlenir</strong>: karakter sınırı, yasaklı
        ifade ve en önemlisi — üründe olmayan bir teknik değer iddia edilip edilmediği. Denetimi geçmeyenler aşağıda
        nedeniyle duruyor.
      </Note>

      {accepted.map((t, i) => (
        <Card key={i} title={`Öneri ${i + 1}`} description={`${t.chars} karakter`}>
          <p className="text-small font-medium text-foreground">{t.title}</p>
          <p className="mt-2 text-caption text-muted">{t.rationale}</p>
          {t.claims.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.claims.map((c) => (
                <Badge key={c} tone="success">
                  ✓ {c}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>
      ))}

      {rejected.length > 0 ? (
        <Card title="Denetimi geçmeyen taslaklar" description="Gösterilmiyor, ama saklanıyor — modelin nerede zorlandığı bilgidir.">
          <div className="grid gap-3">
            {rejected.map((t, i) => (
              <div key={i} className="rounded-lg border border-error/30 bg-error/5 px-3.5 py-2.5">
                <p className="text-small text-foreground">{t.title}</p>
                <ul className="mt-1.5 list-inside list-disc text-caption text-error">
                  {t.violations.map((v, j) => (
                    <li key={j}>{v.message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SwotTab({ a }: { a: StoredAnalysis }) {
  const s = a.swot;
  if (!s) return <EmptyState title="SWOT üretilmedi" />;
  const quads: Array<{ title: string; items: typeof s.strengths; tone: BadgeTone }> = [
    { title: "Güçlü yönler", items: s.strengths, tone: "success" },
    { title: "Zayıf yönler", items: s.weaknesses, tone: "warning" },
    { title: "Fırsatlar", items: s.opportunities, tone: "info" },
    { title: "Tehditler", items: s.threats, tone: "danger" },
  ];
  return (
    <div className="grid gap-5">
      <Note>
        Her madde bir ölçüme bağlıdır. Ölçüm yoksa kutu <strong>boş bırakılır</strong> — dört kutuyu doldurmak için
        genel geçer cümle üretilmez.
      </Note>
      <div className="grid gap-5 lg:grid-cols-2">
        {quads.map((q) => (
          <Card key={q.title} title={q.title}>
            {q.items.length === 0 ? (
              <p className="text-small text-subtle">Yeterli veri toplanamadı; boş bırakıldı.</p>
            ) : (
              <ul className="grid gap-3">
                {q.items.map((it, i) => (
                  <li key={i}>
                    <div className="flex items-start gap-2">
                      <Badge tone={q.tone}>•</Badge>
                      <span className="text-small text-foreground">{it.text}</span>
                    </div>
                    <Why>{it.basis}</Why>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function LaunchTab({ a }: { a: StoredAnalysis }) {
  const sk = a.launch?.skeleton;
  return (
    <div className="grid gap-5">
      {a.launch?.narrative ? (
        <Card title="Giriş yaklaşımı" description="AI yorumu — ölçümleri açıklar.">
          <div className="whitespace-pre-wrap text-small text-foreground">{a.launch.narrative}</div>
        </Card>
      ) : (
        <Note tone="warning">{a.aiDisabledNote ?? "Giriş planı metni üretilmedi."}</Note>
      )}

      {sk?.highlightFacets?.length ? (
        <Card title="Öne çıkarılacak özellikler" description="Ölçülen fırsat sırasına göre.">
          <ul className="grid gap-3">
            {sk.highlightFacets.map((f, i) => (
              <li key={i}>
                <span className="text-small text-foreground">
                  <strong>{f.label}:</strong> {f.value}
                </span>
                <Why>{f.reason}</Why>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {sk?.priceApproach ? (
        <Card title="Fiyatlandırma yaklaşımı">
          <p className="text-small text-foreground">{sk.priceApproach.rationale}</p>
          {sk.priceApproach.from != null ? (
            <p className="mt-2 text-caption text-muted">
              Hedef bant: {fmt(sk.priceApproach.from)} {sk.priceApproach.to != null ? `– ${fmt(sk.priceApproach.to)}` : "ve üzeri"}{" "}
              {a.market?.currency}
            </p>
          ) : null}
        </Card>
      ) : null}

      {sk?.keywordsToAdd?.length ? (
        <Card title="İlan metnine eklenecek kelimeler" description="Pazarın kullandığı, bizim metnimizde olmayan kelimeler.">
          <div className="flex flex-wrap gap-1.5">
            {sk.keywordsToAdd.map((k) => (
              <Badge key={k} tone="accent">
                {k}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {sk?.metricsToWatch?.length ? (
        <Card title="İlk dönemde takip edilecekler" padded={false}>
          <Table>
            <thead>
              <Tr>
                <Th>Metrik</Th>
                <Th>Neden</Th>
                <Th>Referans</Th>
              </Tr>
            </thead>
            <tbody>
              {sk.metricsToWatch.map((m, i) => (
                <Tr key={i}>
                  <Td>{m.metric}</Td>
                  <Td>{m.why}</Td>
                  <Td>{m.reference}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {sk?.unknowns?.length ? (
        <Card title="Bu analizin söyleyemedikleri" description="Bilinmeyeni bilmek, yanlış bilmekten iyidir.">
          <ul className="list-inside list-disc text-small text-muted">
            {sk.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Kaynaklar({ a }: { a: StoredAnalysis }) {
  const scope = a.scanScope;
  return (
    <div className="grid gap-5">
      <Note>
        Bu defter olmadan hiçbir ekran &quot;pazarda yok&quot; diyemez. Nereye bakıldığı, ne alındığı ve neyin
        alınamadığı burada duruyor.
      </Note>

      <Card title="Tarama kapsamı">
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="Tarih">{scope?.scannedAt ? new Date(scope.scannedAt).toLocaleString("tr-TR") : "—"}</Detail>
          <Detail label="Girilen satır">{scope?.offersSubmitted ?? 0}</Detail>
          <Detail label="Kullanılan ilan">{scope?.offersUsed ?? 0}</Detail>
          <Detail label="Fiyatı okunabilen">{scope?.offersWithPrice ?? 0}</Detail>
          <Detail label="Denenen kaynak">{scope?.sourcesAttempted ?? 0}</Detail>
          <Detail label="Başarısız kaynak">{scope?.sourcesFailed ?? 0}</Detail>
        </div>
        {scope?.notes?.length ? (
          <ul className="mt-3 list-inside list-disc text-caption text-muted">
            {scope.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Kaynak defteri" padded={false}>
        {a.scans.length === 0 ? (
          <EmptyState title="Kaynak kaydı yok" />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Kaynak</Th>
                <Th>Adres</Th>
                <Th>Durum</Th>
                <Th align="right">HTTP</Th>
                <Th align="right">Bulunan</Th>
                <Th>Not</Th>
              </Tr>
            </thead>
            <tbody>
              {a.scans.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.queryText ?? "—"}</Td>
                  <Td>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-info hover:underline">
                        {s.url.slice(0, 48)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <Badge tone={s.status === "OK" ? "success" : s.status === "EMPTY" ? "warning" : "danger"}>
                      {SCAN_STATUS_LABELS[s.status] ?? s.status}
                      {s.blockKind ? ` · ${s.blockKind}` : ""}
                    </Badge>
                  </Td>
                  <Td align="right">{s.httpStatus ?? "—"}</Td>
                  <Td align="right">{s.itemsFound}</Td>
                  <Td>
                    {s.note ?? "—"}
                    {s.fromCache ? " (önbellek)" : ""}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {scope?.parseSkipped?.length ? (
        <Card title="Okunamayan satırlar" description="Atıldılar ama gizlenmediler." padded={false}>
          <Table>
            <thead>
              <Tr>
                <Th align="right">Satır</Th>
                <Th>İçerik</Th>
                <Th>Sebep</Th>
              </Tr>
            </thead>
            <tbody>
              {scope.parseSkipped.map((s, i) => (
                <Tr key={i}>
                  <Td align="right">{s.line}</Td>
                  <Td>{s.text.slice(0, 80)}</Td>
                  <Td>{s.reason}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card title="Kanıt defteri" description="Her çıkarım, dayandığı ölçümle birlikte." padded={false}>
        {a.evidence.length === 0 ? (
          <EmptyState title="Kanıt kaydı yok" />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Alan</Th>
                <Th>Bulgu</Th>
                <Th>Kaynak</Th>
              </Tr>
            </thead>
            <tbody>
              {a.evidence.map((e) => (
                <Tr key={e.id}>
                  <Td>{EVIDENCE_AREA_LABELS[e.area] ?? e.area}</Td>
                  <Td>
                    <span className="mr-1.5">{e.polarity === "POSITIVE" ? "✓" : e.polarity === "NEGATIVE" ? "⚠" : "·"}</span>
                    {e.text}
                  </Td>
                  <Td>
                    <Prov p={e.provenance} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
