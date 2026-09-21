import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportCase } from "@/server/import/repo";
import { formatGtip } from "@/server/import/text";
import { countryName, DUTY_COLUMN_LABELS, type DutyColumn } from "@/server/import/countries";
import { PROVENANCE_LABELS, type EvidenceItem, type Provenance, type SourceRef } from "@/server/import/types";
import { TAX_STATUS_LABELS, type TaxResult, type TaxLineStatus } from "@/server/import/tax";
import { COMPLIANCE_LEVEL_LABELS, type ComplianceCheck } from "@/server/import/compliance";
import type { LandedCost } from "@/server/import/landed";
import type { OriginDecision } from "@/server/import/origin";
import type { ProductAttributes } from "@/server/import/attributes";
import type { AreaStatus, ImportAnalysisInput } from "@/server/import/analyze";
import type { UserGtipCheck } from "@/server/import/classify";
import type { LogisticsQueryResult } from "@/server/logistics/query";
import { Badge, Card, Detail, Note, PageHead, Table, Td, Th, Tr, btn, type BadgeTone } from "@/components/os/ui";
import { deleteImportCaseAction } from "../actions";

export const metadata: Metadata = { title: "İthalat analizi · Business OS" };
export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

const PROV_TONE: Record<Provenance, BadgeTone> = {
  OFFICIAL: "success",
  AI_PREDICTED: "warning",
  USER_ENTERED: "info",
  CALCULATED: "neutral",
  WEB_EXTRACTED: "accent",
  INFERRED: "neutral",
  UNKNOWN: "danger",
};

function Prov({ p }: { p: Provenance }) {
  return <Badge tone={PROV_TONE[p] ?? "neutral"}>{PROVENANCE_LABELS[p] ?? p}</Badge>;
}

const TAX_TONE: Record<TaxLineStatus, BadgeTone> = {
  CALCULATED: "success",
  NOT_APPLICABLE: "neutral",
  NOT_COMPUTED: "warning",
  INSUFFICIENT: "danger",
  NEEDS_REVIEW: "warning",
  CONFLICT: "danger",
  NOT_CHECKED: "neutral",
};

const COMPLIANCE_TONE: Record<string, BadgeTone> = { GREEN: "success", YELLOW: "warning", RED: "danger", INSUFFICIENT: "neutral" };
const AREA_TONE: Record<AreaStatus["tone"], BadgeTone> = { ok: "success", warn: "warning", bad: "danger", info: "info" };

function Why({ title, items }: { title: string; items: Array<string | EvidenceItem> }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-2 rounded-lg border border-border bg-surface-sunken/60 px-3 py-2">
      <summary className="cursor-pointer text-caption font-medium text-foreground">{title}</summary>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) =>
          typeof it === "string" ? (
            <li key={i} className="text-caption text-muted">→ {it}</li>
          ) : (
            <li key={i} className="flex flex-wrap items-start gap-1.5 text-caption text-muted">
              <span>{it.polarity === "POSITIVE" ? "✓" : it.polarity === "NEGATIVE" ? "⚠" : "·"}</span>
              <span className="flex-1">{it.text}</span>
              <Prov p={it.provenance} />
            </li>
          ),
        )}
      </ul>
    </details>
  );
}

type CandidateRationale = {
  positive: EvidenceItem[];
  negative: EvidenceItem[];
  missing: EvidenceItem[];
  siblings: Array<{ gtip: string; description: string; reason: string }>;
  whyLower: string | null;
  conceptLabel: string | null;
  headingText: string | null;
};

type Summary = {
  statuses: AreaStatus[];
  web: Array<{ url: string; status: string; tier: number; title: string | null; structured: boolean; error: string | null; fromCache: boolean }>;
  fx: { table: Record<string, { rate: number | null; source: string; note: string }>; baseCurrency: string; day: string | null };
  sources: SourceRef[];
  classification?: { mode: string; status: string; residualPct: number; capReasons: string[]; userCheck: UserGtipCheck | null };
};

export default async function ImportCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getImportCase(id);
  if (!c) notFound();

  const input = c.input as unknown as ImportAnalysisInput;
  const attrs = c.productProfile as unknown as ProductAttributes;
  const origin = c.origin as unknown as OriginDecision;
  const compliance = c.compliance as unknown as { checks: ComplianceCheck[]; overall: string };
  const tax = c.tax as unknown as TaxResult;
  const logistics = c.logistics as unknown as { query: LogisticsQueryResult | null; note: string; freightSource: string } | Record<string, never>;
  const landed = c.landedCost as unknown as LandedCost;
  const summary = c.statusSummary as unknown as Summary;
  const base = summary.fx?.baseCurrency ?? "TRY";

  const selected = c.candidates.find((x) => x.selected) ?? c.candidates[0] ?? null;
  const alternatives = c.candidates.filter((x) => x !== selected);
  const selRat = (selected?.rationale ?? null) as unknown as CandidateRationale | null;
  const cls = summary.classification;
  const status = c.classificationStatus;
  const caseEvidence = c.evidence.filter((e) => !e.candidateId);

  const statusBadge =
    status === "AI_PREDICTED" ? <Badge tone="warning">🟡 AI TARAFINDAN TAHMİN EDİLDİ</Badge>
    : status === "USER_ENTERED" ? <Badge tone="info">🔵 KULLANICI TARAFINDAN GİRİLDİ</Badge>
    : status === "BTB_DECLARED" ? <Badge tone="info">🔵 BTB BEYANI — SİSTEMCE DOĞRULANMADI</Badge>
    : status === "OFFICIAL_VERIFIED" ? <Badge tone="success">🟢 RESMİ / BTB İLE DOĞRULANDI</Badge>
    : <Badge tone="danger">VERİ YETERSİZ</Badge>;

  const purchaseHref = `/os/purchases/new?importCase=${c.id}`;

  return (
    <>
      <PageHead
        title={`${c.code} · ${c.productName}`}
        description={`İthalat tarihi ${c.importDate.toISOString().slice(0, 10)} · analiz ${c.createdAt.toISOString().slice(0, 16).replace("T", " ")}`}
        back={{ href: "/os/import", label: "İthalat" }}
        actions={
          <>
            {c.purchase ? (
              <Link href={`/os/purchases/${c.purchase.id}`} className={btn.secondary}>Alış {c.purchase.code}</Link>
            ) : (
              <Link href={purchaseHref} className={btn.primary}>Alış kaydı oluştur</Link>
            )}
            <form action={deleteImportCaseAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className={btn.ghost} type="submit">Sil</button>
            </form>
          </>
        }
      />

      {/* Per-area status — deliberately no single overall score. */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(summary.statuses ?? []).map((s) => (
          <div key={s.area} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-caption text-subtle">{s.label}</p>
            <div className="mt-1"><Badge tone={AREA_TONE[s.tone]}>{s.status}</Badge></div>
            <p className="mt-1 truncate text-caption text-muted" title={s.detail}>{s.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        {/* PRODUCT */}
        <Card title="Ürün" description="Metinlerden çıkarılan özellikler — her birinin nereden geldiği yanında">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Ürün">{c.productName}</Detail>
            <Detail label="Menşe">{c.originCountry ? countryName(c.originCountry) : "VERİ YETERSİZ"}</Detail>
            <Detail label="Çıkış">{c.dispatchCountry ? countryName(c.dispatchCountry) : "—"}</Detail>
            <Detail label="A.TR">{c.atrAvailable == null ? "Belirtilmedi" : c.atrAvailable ? "Var" : "Yok"}</Detail>
            {c.item ? <Detail label="Business OS ürünü"><Link className="underline" href={`/os/products/${c.item.id}`}>{c.item.sku} · {c.item.name}</Link></Detail> : null}
            {c.supplier ? <Detail label="Tedarikçi"><Link className="underline" href={`/os/companies/${c.supplier.id}`}>{c.supplier.name}</Link></Detail> : null}
          </div>
          <div className="mt-4">
            <Table>
              <thead><tr><Th>Özellik</Th><Th>Değer</Th><Th>Kaynak</Th><Th>Köken</Th></tr></thead>
              <tbody>
                {attributeRows(attrs).map((r) => (
                  <Tr key={r.label}>
                    <Td>{r.label}</Td>
                    <Td>{r.value}</Td>
                    <Td className="text-caption text-muted">{r.from}</Td>
                    <Td>{r.provenance ? <Prov p={r.provenance} /> : <Badge tone="danger">VERİ YETERSİZ</Badge>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          {summary.web?.length ? (
            <div className="mt-3 space-y-1">
              {summary.web.map((w) => (
                <p key={w.url} className="text-caption text-muted">
                  {w.status === "OK" ? "✓" : "✗"} <a className="underline" href={w.url} target="_blank" rel="noopener noreferrer">{w.url}</a> ·{" "}
                  {w.status === "OK" ? `Tier ${w.tier}${w.tier === 3 ? " (üretici alan adı)" : ""}${w.structured ? " · schema.org ürün verisi" : ""}${w.fromCache ? " · önbellek" : ""}` : `KAYNAĞA ERİŞİLEMEDİ — ${w.error ?? ""}`}
                </p>
              ))}
            </div>
          ) : null}
        </Card>

        {/* CLASSIFICATION */}
        <Card title="GTİP" description="Tahmin, resmi/bağlayıcı sınıflandırma değildir">
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-sans text-h4 font-semibold tabular-nums">{formatGtip(selected.gtip)}</p>
                {statusBadge}
              </div>
              <p className="text-small text-muted">{selected.gtipDescription}</p>
              {status === "AI_PREDICTED" ? (
                <div className="space-y-1">
                  <p className="text-small">Tahmin güveni: <b className="tabular-nums">%{fmt(Number(selected.confidencePct), 1)}</b></p>
                  <p className="text-caption text-subtle">
                    Bu yüzde hukuki doğruluk olasılığı değildir: sınıflandırma modelinin, elindeki kanıtlara göre aşağıdaki adaylar arasındaki <b>göreli güven skorudur</b>.
                    {cls && cls.residualPct > 0 ? ` %${fmt(cls.residualPct, 1)} kasıtlı olarak hiçbir adaya verilmedi (listelenmeyen / belirlenemeyen).` : ""}
                  </p>
                </div>
              ) : null}
              {cls?.userCheck ? (
                <Note tone={cls.userCheck.existsInNomenclature && cls.userCheck.agreesWithModel !== false ? "info" : "warning"}>
                  Girilen kod {cls.userCheck.input}: {cls.userCheck.shapeOk ? "biçim geçerli" : cls.userCheck.shapeReason} ·{" "}
                  {cls.userCheck.existsInNomenclature ? "yüklü Türk Gümrük Tarife Cetveli'nde var" : "yüklü tarife cetvelinde 12 haneli satır olarak YOK"} ·{" "}
                  {cls.userCheck.agreesWithModel === true ? "model de aynı alt pozisyonu öneriyor" : cls.userCheck.agreesWithModel === false ? `model farklı alt pozisyon öneriyor (${cls.userCheck.modelTop ? formatGtip(cls.userCheck.modelTop) : "—"})` : "karşılaştırma yok"}
                </Note>
              ) : null}
              {cls?.capReasons?.length ? <Note tone="warning">Güven sınırlandı: {cls.capReasons.join(" ")}</Note> : null}

              {alternatives.length ? (
                <div>
                  <p className="text-caption font-medium text-subtle">Alternatif adaylar</p>
                  <ul className="mt-1 space-y-1">
                    {alternatives.map((a) => (
                      <li key={a.id} className="text-small">
                        <span className="tabular-nums font-medium">{formatGtip(a.gtip)}</span>{" "}
                        <span className="text-muted">— %{fmt(Number(a.confidencePct), 1)}</span>{" "}
                        <span className="text-caption text-subtle">{a.gtipDescription.split(" › ").slice(-1)[0]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selRat ? (
                <>
                  <Why title="Neden bu GTİP?" items={[...selRat.positive, ...selRat.negative, ...selRat.missing]} />
                  {selRat.headingText ? <Why title="Resmi pozisyon metni" items={[selRat.headingText, selected.gtipDescription]} /> : null}
                  <Why
                    title="Alternatifler neden elendi?"
                    items={[
                      ...alternatives.map((a) => `${formatGtip(a.gtip)}: ${((a.rationale as unknown as CandidateRationale).whyLower ?? "daha zayıf uyum")}`),
                      ...(selRat.siblings ?? []).map((s) => `Aynı alt pozisyonda ${formatGtip(s.gtip)} "${s.description}": ${s.reason}`),
                    ]}
                  />
                </>
              ) : null}
              <Why
                title="Kaynaklar ve genel notlar"
                items={caseEvidence.filter((e) => e.area === "CLASSIFICATION" || e.area === "PRODUCT").map((e) => ({ area: "CLASSIFICATION", kind: "NOTE", polarity: e.polarity as EvidenceItem["polarity"], provenance: e.provenance as Provenance, text: `${e.text}${e.source ? ` [${e.source.name}]` : ""}` }))}
              />
            </div>
          ) : (
            <p className="text-small text-muted">VERİ YETERSİZ — aday GTİP bulunamadı. Ürün açıklamasına malzeme, işlev ve teknik özellik ekleyin.</p>
          )}
        </Card>

        {/* ORIGIN */}
        <Card title="Menşe, çıkış ve A.TR" description="Çıkış ülkesi menşe değildir; A.TR menşe belgesi değildir">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Gümrük statüsü">{origin.customsStatus === "FREE_CIRCULATION_EU" ? "AB'de serbest dolaşım (A.TR)" : origin.customsStatus === "THIRD_COUNTRY" ? "Üçüncü ülke eşyası" : "Belirlenemedi"}</Detail>
            <Detail label="Gümrük vergisi sütunu">{origin.dutyColumn ? DUTY_COLUMN_LABELS[origin.dutyColumn as DutyColumn] : "VERİ YETERSİZ"}</Detail>
            <Detail label="İGV sütunu">{origin.additionalDutyColumn ? DUTY_COLUMN_LABELS[origin.additionalDutyColumn as DutyColumn] : "VERİ YETERSİZ"}</Detail>
            <Detail label="Menşe belgesi">{c.originProof ?? "—"}</Detail>
          </div>
          <Why title="Neden bu sütunlar?" items={[...origin.dutyWhy, ...origin.additionalDutyWhy, ...origin.evidence]} />
        </Card>

        {/* COMPLIANCE */}
        <Card title="İthalat denetimleri ve uyum" description="Resmi Ticaret Bakanlığı sayfalarına dayanır; tebliğ eki GTİP listeleri sistemde yok — hiçbir kontrol 'uygun' sayılmaz">
          <div className="space-y-3">
            {compliance.checks.map((ch) => (
              <div key={ch.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={COMPLIANCE_TONE[ch.level] ?? "neutral"}>{COMPLIANCE_LEVEL_LABELS[ch.level]}</Badge>
                  <p className="text-small font-semibold">{ch.label}</p>
                  <span className="text-caption text-subtle">{ch.statusText}</span>
                </div>
                <p className="mt-1 text-caption text-muted">{ch.detail}</p>
                {ch.links.length ? (
                  <p className="mt-1 flex flex-wrap gap-3 text-caption">
                    {ch.links.map((l) => <a key={l.url} className="underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
                  </p>
                ) : null}
                <Why title="Kaynaklar" items={ch.evidence} />
              </div>
            ))}
          </div>
        </Card>

        {/* TAX */}
        <Card title="İthalat vergileri ve önlemler" description={`Tutarlar ${base}; her kalem ayrı hesaplanır`}>
          {tax.basedOnPredictedGtip ? <div className="mb-3"><Note tone="warning">⚠ Vergiler AI tarafından TAHMİN EDİLEN GTİP ile hesaplandı. GTİP değişirse tüm kalemler değişir.</Note></div> : null}
          <div className="mb-3 grid gap-4 sm:grid-cols-3">
            <Detail label="Gümrük kıymeti (CIF)">{tax.customsValue.amount != null ? `${fmt(tax.customsValue.amount)} ${base}` : tax.customsValue.lowerBound != null ? `En az ${fmt(tax.customsValue.lowerBound)} ${base} (eksik)` : "VERİ YETERSİZ"}</Detail>
            <Detail label="Hesaplanan vergiler (KDV hariç)">{tax.dutiesTotal != null ? `${fmt(tax.dutiesTotal)} ${base}` : `Bilinen: ${fmt(tax.dutiesKnown)} ${base} (eksik kalem var)`}</Detail>
            <Detail label="İthalat KDV'si (indirilebilir)">{tax.vat.amount != null ? `${fmt(tax.vat.amount)} ${base}` : tax.vat.lowerBound != null ? `En az ${fmt(tax.vat.lowerBound)} ${base}` : "VERİ YETERSİZ"}</Detail>
          </div>
          <Why title="Gümrük kıymeti nasıl bulundu?" items={[...tax.customsValue.parts.map((p) => `${p.label}: ${p.amount != null ? `${fmt(p.amount)} ${base}` : "bilinmiyor"} ${p.note ? `(${p.note})` : ""}`), ...tax.customsValue.why]} />
          <div className="mt-3 space-y-2">
            {[...tax.lines, tax.vat].map((l, i) => (
              <div key={`${l.key}-${i}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-small font-semibold">{l.label}</p>
                    <Badge tone={TAX_TONE[l.status]}>{TAX_STATUS_LABELS[l.status]}</Badge>
                  </div>
                  <p className="text-small tabular-nums">
                    {l.rateText ?? (l.ratePct != null ? `%${l.ratePct}` : "—")} ·{" "}
                    <b>{l.amount != null ? `${fmt(l.amount)} ${base}` : l.lowerBound != null ? `en az ${fmt(l.lowerBound)} ${base}` : "—"}</b>
                  </p>
                </div>
                <Why title="Neden?" items={[...l.why, ...(l.sourceKeys.length ? [`Kaynak: ${l.sourceKeys.join(", ")} · İthalat tarihi ${c.importDate.toISOString().slice(0, 10)}`] : [])]} />
              </div>
            ))}
          </div>
          {tax.atrScenario ? (
            <div className="mt-3">
              <Note>{tax.atrScenario.text} gümrük vergisi {tax.atrScenario.dutyPct != null ? `%${tax.atrScenario.dutyPct}` : "belirlenemedi"}, İGV {tax.atrScenario.additionalPct != null ? `%${tax.atrScenario.additionalPct}` : "belirlenemedi"}.</Note>
            </div>
          ) : null}
        </Card>

        {/* LOGISTICS */}
        <Card title="Lojistik ve kur" description="Navlun, mevcut Lojistik Intelligence katmanından; piyasa referansı maliyete eklenmez">
          {"query" in logistics ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <Detail label="Navlun kaynağı">{logistics.freightSource === "USER_ENTERED" ? "Kullanıcı girdisi" : logistics.freightSource === "ESTIMATED" ? "Tahmin (gerçek gözlemler)" : "VERİ YETERSİZ"}</Detail>
                <Detail label="Navlun tahmini">
                  {logistics.query?.estimate.status === "OK" ? `€${fmt(logistics.query.estimate.minEur)} – €${fmt(logistics.query.estimate.maxEur)}` : "VERİ YETERSİZ"}
                </Detail>
                <Detail label="Ücretli ağırlık">{logistics.query?.chargeableWeightKg != null ? `${fmt(logistics.query.chargeableWeightKg, 0)} kg` : "—"}</Detail>
              </div>
              <p className="text-caption text-muted">{logistics.note}</p>
              {logistics.query?.marketReferences.length ? (
                <Note>
                  Piyasa referansı (yayınlanmış fiyat bandı — gerçek navlun değildir, maliyete eklenmedi):{" "}
                  {logistics.query.marketReferences.map((m) => `${m.priceType === "RANGE" ? `${m.priceMin}–${m.priceMax}` : m.priceExact} ${m.currency} (${m.sourceName})`).join("; ")}
                </Note>
              ) : null}
            </div>
          ) : (
            <p className="text-small text-muted">Çıkış şehri/ülkesi girilmediği için lojistik sorgusu yapılmadı. Navlun: {input.freight.amount != null ? `${input.freight.amount} ${input.freight.currency} (kullanıcı girdisi)` : "VERİ YETERSİZ"}</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {Object.entries(summary.fx?.table ?? {}).filter(([k]) => k !== base).map(([k, v]) => (
              <Detail key={k} label={`Kur ${k}`}>{v.rate != null ? `1 ${k} = ${fmt(v.rate, 4)} ${base} · ${v.note}` : `VERİ YETERSİZ — ${v.note}`}</Detail>
            ))}
          </div>
        </Card>

        {/* LANDED COST */}
        <Card title="Landed cost (Türkiye'ye iniş maliyeti)" description="Bilinmeyen kalem uydurulmaz; KDV indirilebilir olduğundan toplama dahil değildir">
          <Table>
            <thead><tr><Th>Kalem</Th><Th align="right">Tutar ({base})</Th><Th>Durum</Th><Th>Not</Th></tr></thead>
            <tbody>
              {landed.lines.map((l) => (
                <Tr key={l.key + l.label}>
                  <Td>{l.label}</Td>
                  <Td align="right" numeric>{l.min == null ? "—" : l.min === l.max ? fmt(l.min) : `${fmt(l.min)} – ${fmt(l.max)}`}</Td>
                  <Td><Badge tone={l.status === "UNKNOWN" ? "danger" : l.status === "ESTIMATED" ? "warning" : l.status === "USER_ENTERED" ? "info" : "neutral"}>{l.status === "UNKNOWN" ? (l.unchecked ? "KONTROL EDİLMEDİ" : "VERİ YETERSİZ") : l.status === "USER_ENTERED" ? "KULLANICI GİRDİSİ" : l.status === "ESTIMATED" ? "TAHMİN" : l.status === "OFFICIAL" ? "RESMİ" : "HESAPLANDI"}</Badge></Td>
                  <Td className="text-caption text-muted">{l.note}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Detail label="Toplam">
              {landed.totalMin != null ? `${fmt(landed.totalMin)}${landed.totalMax !== landed.totalMin ? ` – ${fmt(landed.totalMax)}` : ""} ${base}` : `EKSİK — bilinen kalemler ${fmt(landed.knownTotal)} ${base}`}
            </Detail>
            <Detail label="Birim maliyet">{landed.perUnitMin != null ? `${fmt(landed.perUnitMin)}${landed.perUnitMax !== landed.perUnitMin ? ` – ${fmt(landed.perUnitMax)}` : ""} ${base}` : "—"}</Detail>
            <Detail label="Durum">
              <Badge tone={landed.completeness === "COMPLETE" ? "success" : landed.missing.length ? "danger" : "warning"}>
                {landed.completeness === "COMPLETE" ? "TAM" : landed.missing.length ? `EKSİK — ${landed.missing.join(", ")}` : `KISMİ — ${landed.unchecked.join(", ")} hariç`}
              </Badge>
            </Detail>
            <Detail label="Marj">
              {landed.margin?.marginMinPct != null ? `%${fmt(landed.margin.marginMinPct, 1)}${landed.margin.marginMaxPct !== landed.margin.marginMinPct ? ` – %${fmt(landed.margin.marginMaxPct, 1)}` : ""} (satış ${fmt(landed.margin.salePriceBase)} ${base})` : landed.margin?.status ?? "Satış fiyatı girilmedi"}
            </Detail>
          </div>
          <div className="mt-3">
            <Note>Gerçek maliyet ürün kartına, bu analizden oluşturulan <b>alış kaydı onaylandığında</b> mevcut maliyet motoruyla yazılır (navlun/gümrük maliyet satırları dağıtılır).</Note>
          </div>
        </Card>

        {/* SOURCE TRACE */}
        <Card title="Kaynak izi" description="Hesabın dayandığı her kaynak sürümü">
          <Table>
            <thead><tr><Th>Kaynak</Th><Th>Tier</Th><Th>Durum</Th><Th>Alındı</Th><Th>Sürüm</Th></tr></thead>
            <tbody>
              {(summary.sources ?? []).map((s) => (
                <Tr key={s.key}>
                  <Td>
                    {s.url ? <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
                    <div className="text-caption text-subtle">{s.publisher}</div>
                    {s.note ? <div className="text-caption text-warning">{s.note}</div> : null}
                  </Td>
                  <Td>{s.tier}</Td>
                  <Td><Badge tone={s.status === "OK" ? "success" : s.status === "MANUAL_ONLY" ? "info" : "danger"}>{s.status === "OK" ? "ERİŞİLDİ" : s.status === "MANUAL_ONLY" ? "ELLE KONTROL" : s.status === "CHANGED" ? "KAYNAK DEĞİŞTİ" : "KAYNAĞA ERİŞİLEMEDİ"}</Badge></Td>
                  <Td className="text-caption">{s.fetchedAt?.slice(0, 10) ?? "—"}</Td>
                  <Td className="text-caption">{s.version ?? "—"}{s.consolidatedAsOf ? ` · konsolide ${s.consolidatedAsOf}` : ""}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function attributeRows(a: ProductAttributes): Array<{ label: string; value: string; from: string; provenance: Provenance | null }> {
  const one = (label: string, x: { value: unknown; provenance: Provenance; from: string } | null, show?: (v: unknown) => string) =>
    ({ label, value: x ? (show ? show(x.value) : String(x.value)) : "VERİ YETERSİZ", from: x?.from ?? "—", provenance: x?.provenance ?? null });
  const rows = [
    one("Marka", a.brand),
    one("Model", a.model),
    one("Üretici parça no", a.mpn),
    { label: "EAN / GTIN", value: a.ean ? `${a.ean.value}${a.ean.valid ? " (kontrol hanesi doğru)" : " (kontrol hanesi YANLIŞ)"}` : "VERİ YETERSİZ", from: a.ean?.from ?? "—", provenance: a.ean?.provenance ?? null },
    {
      label: "Malzeme / bileşim",
      value: a.materials.length ? a.materials.map((m) => `${m.value.label}${m.value.pct != null ? ` %${m.value.pct}` : ""}`).join(", ") : "VERİ YETERSİZ",
      from: a.materials.map((m) => m.from).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") || "—",
      provenance: a.materials[0]?.provenance ?? null,
    },
    { label: "Kumaş yapısı", value: a.constructionConflict ? "ÇELİŞKİLİ KAYNAKLAR (örme + dokuma)" : a.construction ? (a.construction.value === "KNITTED" ? "Örme" : "Dokuma") : "VERİ YETERSİZ", from: a.construction?.from ?? "—", provenance: a.construction?.provenance ?? null },
    one("Kablosuz", a.wireless[0] ? { ...a.wireless[0], value: a.wireless.map((w) => w.value).join(", ") } : null),
    one("Hücresel bağlantı", a.cellular, () => "Var"),
    one("Pil", a.battery),
    one("Güç", a.powerW, (v) => `${v} W`),
    one("Gerilim", a.voltage),
    one("Durum", a.condition, (v) => (v === "NEW" ? "Yeni" : v === "USED" ? "Kullanılmış" : "Yenilenmiş")),
  ];
  return rows;
}
