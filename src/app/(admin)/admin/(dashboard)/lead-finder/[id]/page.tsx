import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Building2, ShoppingCart, AlertTriangle, FileSpreadsheet,
  FileText, Radar as RadarIcon, Search as SearchIcon, CheckCircle2, XCircle, Star,
} from "lucide-react";
import { requireRole } from "@/server/auth";
import { getSearch, listCompaniesForSearch } from "@/server/leads/leads";
import { applyLeadFilters, parseLeadFilters, distinctCities, summarize, priorityOf, sortByRelevance, relevanceRank } from "@/server/leads/filter";
import { PRIORITY_LABELS } from "@/config/leads";
import { PageHeader } from "@/components/admin/page-header";
import { LeadCard } from "@/components/admin/leads/lead-card";
import { LeadFilters } from "@/components/admin/leads/filters";
import { buildWhyLead, positiveWhy } from "@/components/admin/leads/why";
import { flagEmoji } from "@/components/admin/leads/ui";
import { ContinueVerify } from "@/components/admin/leads/continue-verify";
import { countPending } from "@/server/leads/reverify";

export const metadata: Metadata = { title: "Sonuçlar · Lead Finder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LeadResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const sp = await searchParams;

  const search = await getSearch(id);
  if (!search) notFound();

  const all = await listCompaniesForSearch(id);
  const filters = parseLeadFilters(sp);
  // Ordered by relevance to the SEARCHED product first, then score (§V3.8) — the
  // score alone put building-materials and electrical wholesalers above every
  // actual lingerie shop in the first live run.
  const filtered = sortByRelevance(applyLeadFilters(all, filters));
  const cities = distinctCities(all);
  const sum = summarize(all);
  // Firms still awaiting a first website check — drives the "continue" button (§V3.4).
  const pendingCount = await countPending(id);

  // TOP LEADS (§7) — the commercially strongest candidates from the CURRENT
  // filtered view, ranked by the GATED priority then score (never score alone).
  const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, DATA_LIMITED: 0, DO_NOT: -1 };
  const topLeads = [...filtered]
    .map((c) => ({ c, p: priorityOf(c) }))
    .filter((x) => x.p === "HIGH" || x.p === "MEDIUM")
    // Priority first, then RELEVANCE to the searched product, then score. Without
    // the middle term this block led with whichever wholesaler happened to be
    // best documented, regardless of whether it sells anything like the product.
    .sort(
      (a, b) =>
        (PRIORITY_RANK[b.p] ?? 0) - (PRIORITY_RANK[a.p] ?? 0) ||
        relevanceRank(b.c) - relevanceRank(a.c) ||
        (b.c.leadScore ?? -1) - (a.c.leadScore ?? -1),
    )
    .slice(0, 3)
    .map(({ c, p }) => ({
      c,
      p,
      why: positiveWhy(
        buildWhyLead({
          businessModel: c.businessModel,
          productFit: c.productFit,
          modelFit: c.modelFit,
          modelFitEvidence: c.modelFitEvidence,
          websiteStatus: c.websiteStatus,
          hasEmail: Boolean(c.email),
          hasPhone: Boolean(c.phone),
          contactCount: c.contactCount,
          socialMatchStatus: c.socialMatchStatus,
          hasInstagram: Boolean(c.instagramUrl),
          hasLinkedin: Boolean(c.linkedinUrl),
        }),
      ),
    }));
  const osmStat = search.sourceStats?.osm;
  const discoveryFailed = search.discoveryStatus === "FAILED";
  const discoveryPartial = search.discoveryStatus === "PARTIAL";

  // Preserve active filters in the export links (§27).
  const exportQuery = new URLSearchParams();
  exportQuery.set("search", id);
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") exportQuery.set(k, String(v));
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/lead-finder" className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Lead Finder
        </Link>
      </div>

      {/* Context header (§24) */}
      <PageHeader
        title="Lead Finder"
        description={undefined}
        actions={
          <div className="flex gap-2">
            <a
              href={`/admin/lead-finder/export?${exportQuery.toString()}&format=csv`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-small font-semibold text-foreground transition-colors hover:border-accent/50"
            >
              <FileText className="size-4" aria-hidden="true" /> CSV
            </a>
            <a
              href={`/admin/lead-finder/export?${exportQuery.toString()}&format=xlsx`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" /> Excel'e Aktar
            </a>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-body font-semibold text-foreground">
          <span aria-hidden="true">{flagEmoji(search.country)}</span> {search.countryLabel}
        </span>
        <span className="text-subtle">·</span>
        <span className="text-body font-medium text-foreground">{search.productQuery}</span>
        {search.city ? <><span className="text-subtle">·</span><span className="text-small text-muted">{search.city}</span></> : null}
        <span className="text-subtle">·</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-small font-medium text-muted">
          {search.businessModel === "B2B" ? <Building2 className="size-3.5" aria-hidden="true" /> : <ShoppingCart className="size-3.5" aria-hidden="true" />}
          {search.businessModel}
        </span>
        {search.radarSnapshotId ? (
          <Link
            href={`/admin/radar/analysis/${search.radarSnapshotId}`}
            className="inline-flex items-center gap-1 rounded-md bg-[#eaf3ec] px-2 py-0.5 text-small font-medium text-[#2f7a48] hover:underline"
          >
            <RadarIcon className="size-3.5" aria-hidden="true" />
            RADAR {search.radarScore != null ? `${search.radarScore}/100` : ""}
          </Link>
        ) : null}
      </div>

      {/* Discovery source status (§5 — V2 reliability fix) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-5 py-3 text-caption">
        <span className="font-semibold text-foreground">Keşif kaynağı</span>
        <span className="inline-flex items-center gap-1.5">
          {discoveryFailed ? (
            <><XCircle className="size-4 text-[#8a2b2b]" aria-hidden="true" /> <b className="text-[#8a2b2b]">OSM · Erişilemedi</b></>
          ) : discoveryPartial ? (
            <><AlertTriangle className="size-4 text-[#8a6d1f]" aria-hidden="true" /> <b className="text-[#8a6d1f]">OSM · Kısmi</b></>
          ) : (
            <><CheckCircle2 className="size-4 text-[#2f7a48]" aria-hidden="true" /> <b className="text-[#2f7a48]">OSM · Başarılı</b></>
          )}
        </span>
        {osmStat ? (
          <span className="text-subtle">
            {osmStat.queriesRun} sorgudan <b className="font-medium text-foreground">{osmStat.queriesOk}</b> başarılı
            {osmStat.queriesFailed > 0 ? `, ${osmStat.queriesFailed} başarısız` : ""} · {osmStat.rawResults} ham sonuç
          </span>
        ) : null}
        {osmStat?.queries && osmStat.queries.length > 0 ? (
          <details className="w-full">
            <summary className="cursor-pointer select-none text-caption font-medium text-accent hover:underline">
              Çalıştırılan sorgular ({osmStat.queries.length})
            </summary>
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {osmStat.queries.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-caption">
                  {q.status === "ok" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#2f7a48]" aria-hidden="true" />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-[#8a2b2b]" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{q.label}</span>
                    <span className="text-subtle"> · {q.provider}</span>
                    {q.status === "ok" ? (
                      <span className="text-subtle"> · {q.rawResults} ham sonuç</span>
                    ) : (
                      <span className="text-[#8a2b2b]"> · başarısız{q.error ? ` (${q.error})` : ""}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {discoveryFailed ? (
        <div className="mb-6 rounded-xl border border-[#e0b4b4] bg-[#fbeaea] p-4">
          <p className="flex items-center gap-2 text-small font-semibold text-[#8a2b2b]">
            <XCircle className="size-4" aria-hidden="true" /> Discovery kaynağına erişilemedi
          </p>
          <p className="mt-1.5 text-caption text-[#8a2b2b]">
            OpenStreetMap sorguları bu turda yanıt vermedi. <b>Bu nedenle bu arama için güvenilir bir
            "0 sonuç" kararı verilemez</b> — sonuç azlığı "bu pazarda firma yok" anlamına gelmez.
            Lütfen birkaç dakika sonra tekrar deneyin (kaynak yoğun olabilir).
          </p>
        </div>
      ) : discoveryPartial ? (
        <div className="mb-6 rounded-xl border border-[#e5d4a0] bg-[#f8f1dc] p-4">
          <p className="flex items-center gap-2 text-small font-semibold text-[#8a6d1f]">
            <AlertTriangle className="size-4" aria-hidden="true" /> Kısmi keşif
          </p>
          <p className="mt-1.5 text-caption text-[#8a6d1f]">
            Bazı keşif sorguları yanıt vermedi; sonuçlar eksik olabilir. Tekrar çalıştırmak daha fazla aday getirebilir.
          </p>
        </div>
      ) : null}

      {/* Summary (§15) */}
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-small">
        <span className="text-muted"><b className="font-semibold text-foreground">{sum.total.toLocaleString("tr-TR")}</b> lead</span>
        <span className="text-muted"><b className="font-semibold text-foreground">{sum.high}</b> yüksek öncelik</span>
        <span className="text-muted"><b className="font-semibold text-foreground">{sum.medium}</b> orta</span>
        <span className="text-muted"><b className="font-semibold text-[#2f7a48]">{sum.withContact}</b> karar verici</span>
        <span className="text-muted"><b className="font-semibold text-[#2f7a48]">{sum.withSocial}</b> sosyal doğrulandı</span>
      </div>
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-caption text-subtle">
        <span>Ürün: <b className="font-medium text-[#2f7a48]">{sum.verified}</b> doğrulandı · <b className="font-medium text-[#8a6d1f]">{sum.likely}</b> muhtemel · {sum.needsReview} belirsiz · {sum.unverified} doğrulanmadı</span>
        <span>{search.businessModel} uygunluğu: <b className="font-medium text-[#2f7a48]">{sum.modelVerified}</b> doğrulandı · {sum.modelPossible} belirsiz</span>
        {sum.notSuitable > 0 ? <span>{sum.notSuitable} {search.businessModel} için uygun değil (gizli)</span> : null}
        {sum.notRelevant > 0 ? <span>{sum.notRelevant} ilgisiz (gizli)</span> : null}
      </div>

      {/* Verification coverage (§V3.3) — separates "checked and unclear" from
          "never checked", so a limit of the run never reads as a fact about a firm. */}
      <div className="mb-6 rounded-lg border border-subtle bg-surface-sunken px-3 py-2 text-caption text-subtle">
        <b className="font-medium text-foreground">Doğrulama kapsamı:</b>{" "}
        <b className="font-medium text-[#2f7a48]">{sum.siteChecked}</b> firmanın sitesi okundu
        {sum.siteUnreachable > 0 ? <> · {sum.siteUnreachable} siteye ulaşılamadı</> : null}
        {sum.siteNotChecked > 0 ? <> · <b className="font-medium text-[#8a6d1f]">{sum.siteNotChecked}</b> firma bu turda kontrol edilmedi</> : null}
        {sum.siteNotChecked > 0 ? (
          <span className="ml-1">
            — kontrol edilmeyenler için &quot;belirsiz&quot; ifadesi <i>o firma hakkında bir bulgu değil</i>, sadece bu turda sıra gelmediği anlamına gelir.
          </span>
        ) : null}
        <ContinueVerify searchId={search.id} pending={pendingCount} />
      </div>

      {/* Provider errors / honest limitations (§16/§31) */}
      {search.errors.length > 0 ? (
        <div className="mb-6 rounded-xl border border-[#e5d4a0] bg-[#f8f1dc] p-4">
          <p className="flex items-center gap-2 text-small font-semibold text-[#8a6d1f]">
            <AlertTriangle className="size-4" aria-hidden="true" /> Kaynak notları
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-caption text-[#8a6d1f]">
            {search.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* TOP LEADS (§7) — commercially strongest candidates first, with "why" */}
      {topLeads.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-[#bcd8c4] bg-[#f4faf6] p-5">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-foreground">
            <Star className="size-4 text-[#2f7a48]" aria-hidden="true" /> Öne çıkan lead&apos;ler
          </h2>
          <p className="mt-0.5 text-caption text-subtle">
            Ticari açıdan en değerli adaylar — yalnızca ürün uyumu, ticari model, website ve iletişim gibi
            doğrulanmış sinyallere göre sıralanır (yüksek skor tek başına yeterli değildir).
          </p>
          <ol className="mt-4 grid gap-3 lg:grid-cols-3">
            {topLeads.map(({ c, p, why }, i) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-caption font-bold text-[#2f7a48]">#{i + 1}</span>
                    <h3 className="truncate text-small font-semibold text-foreground">{c.name}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-bold tabular-nums text-foreground">
                    {c.leadScore ?? "—"}
                  </span>
                </div>
                <span className="w-fit rounded-md bg-[#eaf3ec] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2f7a48]">
                  {PRIORITY_LABELS[p]}
                </span>
                <ul className="flex flex-col gap-0.5">
                  {why.slice(0, 5).map((r) => (
                    <li key={r.key} className="flex items-start gap-1.5 text-caption text-muted">
                      <span aria-hidden="true">{r.dot}</span>
                      <span><b className="font-medium text-foreground">{r.label}:</b> {r.detail}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/admin/lead-finder/company/${c.id}`}
                  className="mt-auto inline-flex items-center gap-1 pt-1 text-caption font-semibold text-foreground hover:text-accent"
                >
                  Detay →
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-6">
        <LeadFilters cities={cities} />
      </div>

      {/* Results */}
      {all.length === 0 ? (
        discoveryFailed ? (
          <EmptyState
            title="Sonuç, kaynağa erişilemediği için üretilemedi"
            body="Yukarıdaki uyarıya bakın: OpenStreetMap bu turda yanıt vermedi. Güvenilir bir '0 sonuç' kararı verilemez — lütfen birkaç dakika sonra tekrar deneyin."
          />
        ) : (
          <EmptyState
            title="Bu aramada aday bulunamadı"
            body="OpenStreetMap yanıt verdi ancak bu ülke/ürün için kayıt bulunamadı. Bu, 'bu pazarda böyle firma yok' anlamına GELMEZ — yalnızca ücretsiz kaynaktaki kapsamın sınırlı olduğunu gösterir. Şehir belirterek veya ürünü farklı yazarak tekrar deneyebilirsiniz."
          />
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Filtrelere uyan sonuç yok"
          body="Aktif filtreleri gevşetin ya da temizleyin."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <LeadCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-sunken p-10 text-center">
      <SearchIcon className="mx-auto size-6 text-subtle" aria-hidden="true" />
      <h3 className="mt-3 text-h6 font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-small text-muted">{body}</p>
    </div>
  );
}
