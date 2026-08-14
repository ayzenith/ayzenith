import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Globe, Phone, Mail, MapPin, ExternalLink, Users, Info, Store,
  Radar as RadarIcon, ShieldCheck, CheckCircle2, XCircle, MinusCircle, ClipboardCheck, Share2, Sparkles,
} from "lucide-react";
import { requireRole } from "@/server/auth";
import { getCompany } from "@/server/leads/leads";
import {
  LEAD_ROLE_LABELS, SIZE_LABELS, LEAD_COMPONENT_LABELS, SOURCE_TYPE_LABELS,
  FRESHNESS_META, scoreBand, qualifiedPriority, PRIORITY_LABELS,
  DETECTED_MODEL_LABELS, WEBSITE_STATUS_LABELS, MODEL_FIT_META, SOCIAL_PLATFORMS,
  type LeadScoreComponent,
} from "@/config/leads";
import { PageHeader } from "@/components/admin/page-header";
import { LEAD_BAND, FIT_STYLE, flagEmoji, fmtDate, confidencePct } from "@/components/admin/leads/ui";
import { buildWhyLead } from "@/components/admin/leads/why";

export const metadata: Metadata = { title: "Lead Detayı · Lead Finder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type BreakdownComponent = {
  key: LeadScoreComponent;
  weight: number;
  available: boolean;
  score: number | null;
  note: string;
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const c = await getCompany(id);
  if (!c) notFound();

  const band = LEAD_BAND[scoreBand(c.leadScore)];
  const fit = FIT_STYLE[c.productFit] ?? FIT_STYLE.UNVERIFIED!;
  const fresh = FRESHNESS_META[c.freshness] ?? FRESHNESS_META.FRESH!;
  const roles = (Array.isArray(c.commercialRoles) ? (c.commercialRoles as string[]) : [])
    .filter((r) => r !== "other")
    .map((r) => LEAD_ROLE_LABELS[r] ?? r);
  const hasContact = c.contacts.length > 0 || Boolean(c.email) || Boolean(c.phone);
  const priority = qualifiedPriority({ leadScore: c.leadScore, modelFit: c.modelFit, productFit: c.productFit, websiteStatus: c.websiteStatus, hasContact });
  const model = c.businessModel === "B2C" ? "B2C" : "B2B";
  const mfit = MODEL_FIT_META[(c.modelFit as keyof typeof MODEL_FIT_META)] ?? MODEL_FIT_META.UNVERIFIED;
  const modelEvidence = Array.isArray(c.modelFitEvidence) ? (c.modelFitEvidence as string[]) : [];
  const socials = SOCIAL_PLATFORMS.map((p) => ({
    label: p.label,
    url: (c[`${p.key}Url` as keyof typeof c] as string | null) ?? null,
  })).filter((s) => s.url);
  const breakdown = c.scoreBreakdown as { components?: BreakdownComponent[] } | null;
  const components = breakdown?.components ?? [];
  const backHref = c.searchId ? `/admin/lead-finder/${c.searchId}` : "/admin/lead-finder";

  // WHY THIS LEAD (§10) — deterministic, sourced reasons (positive AND honest gaps).
  const topContact = c.contacts.find((p) => p.roleVerified && p.role) ?? c.contacts[0];
  const whyReasons = buildWhyLead({
    businessModel: c.businessModel,
    productFit: c.productFit,
    modelFit: c.modelFit,
    modelFitEvidence: modelEvidence,
    websiteStatus: c.websiteStatus,
    hasEmail: Boolean(c.email),
    hasPhone: Boolean(c.phone),
    contactCount: c.contacts.length,
    topContactRole: topContact?.roleVerified ? topContact.role : null,
    socialMatchStatus: c.socialMatchStatus,
    hasInstagram: Boolean(c.instagramUrl),
    hasLinkedin: Boolean(c.linkedinUrl),
  });

  return (
    <>
      <div className="mb-2">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-caption font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Sonuçlara dön
        </Link>
      </div>

      <PageHeader
        title={c.name}
        description={[c.city, c.country].filter(Boolean).join(", ")}
        actions={
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-body font-bold tabular-nums"
            style={{ color: band.fg, backgroundColor: band.bg, border: `1px solid ${band.border}` }}
          >
            <span aria-hidden="true">{band.dot}</span>
            {c.leadScore != null ? `${c.leadScore}/100` : "—"}
            <span className="text-small font-semibold uppercase tracking-wide">{PRIORITY_LABELS[priority]}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: profile */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* WHY THIS LEAD (§10) — the fast "why is this company here?" answer */}
          <section className="rounded-2xl border border-[#bcd8c4] bg-[#f4faf6] p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#2f7a48]" aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">Neden bu lead?</h2>
            </div>
            <p className="mt-1 text-caption text-subtle">
              Aşağıdaki gerekçelerin tamamı yalnızca gerçek, kaynaklı verilerden üretilir. Kaynak yoksa
              “doğrulanamadı” yazar — hiçbir gerekçe tahminle uydurulmaz.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {whyReasons.map((r) => (
                <li key={r.key} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-caption">
                  <span aria-hidden="true">{r.dot}</span>
                  <span className="min-w-0">
                    <b className="font-semibold text-foreground">{r.label}</b>
                    <span className="block text-subtle">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Key facts */}
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-h6 font-semibold text-foreground">Firma Profili</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Fact label="Ülke">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">{flagEmoji(countryToIso(c.country))}</span>{c.country}</span>
              </Fact>
              {c.city ? <Fact label="Şehir">{c.city}</Fact> : null}
              {c.address ? <Fact label="Adres">{[c.address, c.postalCode].filter(Boolean).join(", ")}</Fact> : null}
              <Fact label="Ticari roller">
                {roles.length > 0 ? roles.join(" · ") : <span className="text-subtle">Belirsiz</span>}
              </Fact>
              <Fact label="İşletme boyutu">{SIZE_LABELS[c.size] ?? c.size}</Fact>
              <Fact label="Ürün uyumu">
                <span className="rounded-md px-2 py-0.5 text-small font-medium" style={{ color: fit.fg, backgroundColor: fit.bg }}>{fit.label}</span>
              </Fact>
              <Fact label="Lead Confidence">{confidencePct(c.leadConfidence)}</Fact>
              {c.legalName ? <Fact label="Ticari unvan">{c.legalName}</Fact> : null}
              {c.detectedModel ? <Fact label="İş modeli (tespit)">{DETECTED_MODEL_LABELS[c.detectedModel] ?? c.detectedModel}</Fact> : null}
              {c.websiteStatus ? <Fact label="Website durumu">{WEBSITE_STATUS_LABELS[c.websiteStatus] ?? c.websiteStatus}</Fact> : null}
              {c.employeeCount != null ? <Fact label="Çalışan sayısı">{c.employeeCount.toLocaleString("tr-TR")}</Fact> : null}
              {c.storeCount != null ? <Fact label="Şube/mağaza sayısı">{c.storeCount.toLocaleString("tr-TR")}</Fact> : null}
            </dl>

            {Array.isArray(c.productCategories) && (c.productCategories as string[]).length > 0 ? (
              <div className="mt-4">
                <p className="text-caption text-subtle">Website'de doğrulanan ürün terimleri</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(c.productCategories as string[]).map((t) => (
                    <span key={t} className="rounded-md bg-[#eaf3ec] px-2 py-0.5 text-caption text-[#2f7a48]">{t}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {c.productFitNote ? (
              <p className="mt-4 rounded-lg bg-surface-sunken px-4 py-3 text-caption text-subtle">{c.productFitNote}</p>
            ) : null}

            {/* Contact — only sourced fields */}
            {(c.website || c.phone || c.email) ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-small text-muted">
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-foreground">
                    <Globe className="size-4 shrink-0" aria-hidden="true" />{c.website}
                    <ExternalLink className="size-3 text-subtle" aria-hidden="true" />
                  </a>
                ) : null}
                {c.phone ? <span className="inline-flex items-center gap-2"><Phone className="size-4 shrink-0" aria-hidden="true" />{c.phone}</span> : null}
                {c.email ? <span className="inline-flex items-center gap-2"><Mail className="size-4 shrink-0" aria-hidden="true" />{c.email}</span> : null}
              </div>
            ) : (
              <p className="mt-4 border-t border-border pt-4 text-caption text-subtle">
                İletişim bilgisi bu aşamada bulunamadı. (Derin doğrulama sonraki aşamada eklenecek.)
              </p>
            )}
          </section>

          {/* Model fit + evidence (§1/§8) */}
          <section className="rounded-2xl border p-6" style={{ backgroundColor: mfit.bg, borderColor: mfit.fg + "33" }}>
            <h2 className="text-h6 font-semibold" style={{ color: mfit.fg }}>{model} Uygunluğu: {mfit.dot} {mfit.label}</h2>
            {modelEvidence.length > 0 ? (
              <div className="mt-3">
                <p className="text-caption font-medium" style={{ color: mfit.fg }}>Kanıt:</p>
                <ul className="mt-1 list-inside list-disc text-small" style={{ color: mfit.fg }}>
                  {modelEvidence.map((e, i) => <li key={i} className="opacity-90">{e}</li>)}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-small" style={{ color: mfit.fg }}>Bu model için yeterli sinyal doğrulanamadı.</p>
            )}
          </section>

          {/* Social media (§24) — website-verified links only */}
          {socials.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <Share2 className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Sosyal Medya</h2>
              </div>
              <p className="mt-1 text-caption text-subtle">
                Profiller firmanın kendi websitesinden alındı (sahiplik doğrulandı). Takipçi/aktiflik gibi platform-içi
                veriler ücretsiz+dürüst şekilde okunamadığı için gösterilmiyor.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {socials.map((s) => (
                  <li key={s.label}>
                    <a href={s.url!} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-small hover:border-accent/50">
                      <span className="font-medium text-foreground">{s.label}</span>
                      <span className="inline-flex items-center gap-1 text-caption text-[#2f7a48]">Doğrulandı <ExternalLink className="size-3" aria-hidden="true" /></span>
                    </a>
                  </li>
                ))}
              </ul>
              {c.socialProductSignal === "STRONG" ? (
                <p className="mt-2 text-caption text-[#2f7a48]">🟢 Sosyal profil adında ürün sinyali bulundu.</p>
              ) : null}
            </section>
          ) : null}

          {/* Locations / branches (§9) */}
          {c.locations.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <Store className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Lokasyonlar ({c.locations.length})</h2>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {c.locations.map((l) => (
                  <li key={l.id} className="flex items-start gap-2 py-2 text-caption">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-foreground">{[l.address, l.postalCode, l.city].filter(Boolean).join(", ") || l.name || "Adres yok"}</p>
                      {l.phone ? <p className="text-subtle">{l.phone}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Score breakdown (§14) */}
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-h6 font-semibold text-foreground">Lead Score nasıl hesaplandı?</h2>
            <p className="mt-1 text-caption text-subtle">
              Skor yalnızca <b>ölçülebilen</b> bileşenlerden hesaplanır; veri olmayan bileşen sıfır sayılmaz, ayrıca gösterilir.
            </p>
            <ul className="mt-4 space-y-2.5">
              {components.map((comp) => (
                <li key={comp.key} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-small text-muted">{LEAD_COMPONENT_LABELS[comp.key] ?? comp.key}</span>
                  <span className="text-caption text-subtle">%{comp.weight}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    {comp.available && comp.score != null ? (
                      <div className="h-full rounded-full bg-navy-950" style={{ width: `${comp.score}%` }} />
                    ) : null}
                  </div>
                  <span className="w-24 shrink-0 text-right text-small font-medium tabular-nums text-foreground">
                    {comp.available && comp.score != null ? `${comp.score}/100` : <span className="text-subtle">veri yok</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Contacts (§17/§26) — populated in a later batch */}
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">Karar Vericiler</h2>
            </div>
            {c.contacts.length === 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-sunken px-4 py-3 text-caption text-subtle">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Karar verici keşfi sonraki aşamada devreye girecek. Yalnızca kamuya açık, kurumsal iletişim bilgileri toplanır; kişisel/özel veri toplanmaz.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {c.contacts.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border p-4">
                    <p className="text-small font-semibold text-foreground">
                      {[p.firstName, p.lastName].filter(Boolean).join(" ") || "İsim doğrulanamadı"}
                    </p>
                    <p className="text-caption text-subtle">
                      {p.roleVerified && p.role ? p.role : "Rol doğrulanamadı"}
                    </p>
                    {p.corporateEmail ? <p className="mt-1 text-caption text-muted">{p.corporateEmail}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: provenance + freshness */}
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-h6 font-semibold text-foreground">Kaynaklar</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {c.sources.map((s) => (
                <li key={s.id} className="text-caption">
                  <p className="font-medium text-foreground">{fieldLabel(s.dataField)}</p>
                  <p className="text-subtle">
                    {SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType}
                    {s.sourceUrl ? (
                      <>
                        {" · "}
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                          kaynağı gör <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {c.verifications.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-h6 font-semibold text-foreground">Doğrulama</h2>
              </div>
              <ul className="mt-4 space-y-2">
                {c.verifications.map((v) => (
                  <li key={v.id} className="flex items-start gap-2 text-caption">
                    {v.passed === true ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#2f7a48]" aria-hidden="true" />
                    ) : v.passed === false ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-[#8a2b2b]" aria-hidden="true" />
                    ) : (
                      <MinusCircle className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{CHECK_LABELS[v.check] ?? v.check}</p>
                      {v.evidence ? <p className="text-subtle">{v.evidence}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-h6 font-semibold text-foreground">Veri durumu</h2>
            <p className="mt-3 inline-flex items-center gap-1.5 text-small text-muted">
              <span aria-hidden="true">{fresh.dot}</span> {fresh.label}
            </p>
            <p className="mt-2 text-caption text-subtle">Son kontrol: {fmtDate(c.lastCheckedAt)}</p>
            <p className="text-caption text-subtle">Keşif: {fmtDate(c.discoveredAt)} · {SOURCE_TYPE_LABELS[c.discoveredVia] ?? c.discoveredVia}</p>
            {c.radarSnapshotId ? (
              <Link href={`/admin/radar/analysis/${c.radarSnapshotId}`} className="mt-3 inline-flex items-center gap-1.5 text-caption font-medium text-[#2f7a48] hover:underline">
                <RadarIcon className="size-3.5" aria-hidden="true" /> Kaynak RADAR analizi
              </Link>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-subtle">{label}</dt>
      <dd className="text-small font-medium text-foreground">{children}</dd>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  existence: "Firma varlığı",
  address: "Adres",
  website: "Website",
  phone: "Telefon",
  email: "E-posta",
  productFit: "Ürün uyumu",
  commercialRole: "Ticari rol",
  companySize: "İşletme boyutu",
  contact: "İletişim / karar verici",
};
function fieldLabel(f: string): string {
  return FIELD_LABELS[f] ?? f;
}

const CHECK_LABELS: Record<string, string> = {
  "in-target-country": "Hedef ülkede faaliyet",
  "address-verifiable": "Adres doğrulanabilir",
  "website-present": "Website mevcut",
  "is-real-business": "Gerçek işletme",
  "commercial-role": "Ticari rol doğrulandı",
  "product-connection": "Ürün bağlantısı",
  "contact-present": "İletişim / karar verici",
};

function countryToIso(label: string): string {
  const map: Record<string, string> = {
    Almanya: "DE", Fransa: "FR", Hollanda: "NL", Belçika: "BE", İtalya: "IT",
    İspanya: "ES", Polonya: "PL", İsveç: "SE", Avusturya: "AT", Danimarka: "DK",
    Finlandiya: "FI", Portekiz: "PT", Çekya: "CZ", Romanya: "RO", Yunanistan: "GR",
    Macaristan: "HU", İrlanda: "IE",
  };
  return map[label] ?? "";
}
