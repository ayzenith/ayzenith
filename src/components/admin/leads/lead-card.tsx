import Link from "next/link";
import {
  Globe, Phone, Mail, MapPin, ExternalLink, ChevronRight, Users, ShieldCheck, Store,
} from "lucide-react";
import {
  scoreBand, qualifiedPriority, PRIORITY_LABELS, LEAD_ROLE_LABELS, SIZE_LABELS,
  DETECTED_MODEL_LABELS, FRESHNESS_META, MODEL_FIT_META, SOCIAL_PLATFORMS,
} from "@/config/leads";
import { LEAD_BAND, FIT_STYLE, flagEmoji, fmtDate, confidencePct, externalHref } from "./ui";
import { buildWhyLead, positiveWhy, deriveIdentity } from "./why";
import type { LeadCompanyView } from "@/server/leads/leads";

/**
 * A single lead result card. Shows ONLY sourced fields — a missing website,
 * phone or email simply isn't rendered (never a fabricated placeholder). Score
 * and confidence are shown as two distinct numbers (§15). Colour is always
 * paired with text so it is never the only signal.
 */
export function LeadCard({ c }: { c: LeadCompanyView }) {
  const band = LEAD_BAND[scoreBand(c.leadScore)];
  const fit = FIT_STYLE[c.productFit] ?? FIT_STYLE.UNVERIFIED!;
  const fresh = FRESHNESS_META[c.freshness] ?? FRESHNESS_META.FRESH!;
  const roles = c.commercialRoles.filter((r) => r !== "other").map((r) => LEAD_ROLE_LABELS[r] ?? r);
  const hasContact = c.contactCount > 0 || Boolean(c.email) || Boolean(c.phone);
  // GATED priority (§6): high score alone is never enough.
  const priorityLabel = PRIORITY_LABELS[
    qualifiedPriority({ leadScore: c.leadScore, modelFit: c.modelFit, productFit: c.productFit, websiteStatus: c.websiteStatus, hasContact })
  ];
  const model = c.businessModel === "B2C" ? "B2C" : "B2B";
  // OSM website tags are free text and often lack a scheme (§V3.9).
  const websiteHref = c.website ? externalHref(c.website) : null;
  const mfit = MODEL_FIT_META[(c.modelFit as keyof typeof MODEL_FIT_META)] ?? MODEL_FIT_META.UNVERIFIED;
  const socials = SOCIAL_PLATFORMS.map((p) => ({
    label: p.label,
    url: (c[`${p.key}Url` as keyof LeadCompanyView] as string | null) ?? null,
  })).filter((s) => s.url);

  // "Neden bu lead?" — deterministic, positive reasons only on the card (§7/§10).
  const breakdown = c.scoreBreakdown as { components?: Array<{ key: string; score: number | null; available: boolean; note: string }> } | null;
  const identity = deriveIdentity(c);
  const whyPositive = positiveWhy(
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
      identityStatus: identity.status,
      identityDetail: identity.detail,
      productEvidenceDetail: c.productFitNote,
      scoreComponents: breakdown?.components,
    }),
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-h6 font-semibold text-foreground">{c.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-subtle">
            <span aria-hidden="true">{flagEmoji(countryToIso(c.country))}</span>
            {[c.city, c.country].filter(Boolean).join(", ")}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-bold tabular-nums"
          style={{ color: band.fg, backgroundColor: band.bg, border: `1px solid ${band.border}` }}
        >
          <span aria-hidden="true">{band.dot}</span>
          {c.leadScore != null ? `${c.leadScore}` : "—"}
        </span>
      </div>

      {/* Priority / confidence — two distinct numbers (§9/§15) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
        <span className="font-semibold uppercase tracking-wide" style={{ color: band.fg }}>{priorityLabel}</span>
        <span className="text-subtle">Güven: <span className="font-medium text-foreground">{confidencePct(c.leadConfidence)}</span></span>
        {c.contactCount > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-[#2f7a48]">
            <Users className="size-3.5" aria-hidden="true" /> {c.contactCount} kişi
          </span>
        ) : null}
      </div>

      {/* Roles + size + fit + model */}
      <div className="flex flex-wrap items-center gap-1.5">
        {roles.length > 0 ? (
          roles.map((r) => (
            <span key={r} className="rounded-md bg-surface-sunken px-2 py-0.5 text-caption text-muted">{r}</span>
          ))
        ) : (
          <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-caption text-subtle">Rol belirsiz</span>
        )}
        <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-caption text-muted">{SIZE_LABELS[c.size] ?? c.size}</span>
        {c.detectedModel ? (
          <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-caption text-muted">{DETECTED_MODEL_LABELS[c.detectedModel] ?? c.detectedModel}</span>
        ) : null}
        {c.locationCount > 1 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-caption text-muted">
            <Store className="size-3" aria-hidden="true" /> {c.locationCount} lokasyon
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium" style={{ color: fit.fg, backgroundColor: fit.bg }}>
          {c.productFit === "VERIFIED" ? <ShieldCheck className="size-3" aria-hidden="true" /> : null}
          Ürün: {fit.label}
        </span>
      </div>

      {/* Model fit — the B2B/B2C gate + evidence (§1/§8) */}
      <div className="rounded-lg px-3 py-2 text-caption" style={{ backgroundColor: mfit.bg }}>
        <p className="font-medium" style={{ color: mfit.fg }}>
          {mfit.dot} {model} Uygunluğu: {mfit.label}
        </p>
        {c.modelFitEvidence.length > 0 ? (
          <ul className="mt-0.5 list-inside list-disc" style={{ color: mfit.fg }}>
            {c.modelFitEvidence.slice(0, 2).map((e, i) => (
              <li key={i} className="opacity-90">{e}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Contact — only what is actually sourced */}
      {(c.website || c.phone || c.email || c.address) ? (
        <div className="flex flex-col gap-1 text-caption text-muted">
          {websiteHref ? (
            <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 truncate hover:text-foreground">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{c.domain ?? c.website}</span>
              <ExternalLink className="size-3 shrink-0 text-subtle" aria-hidden="true" />
            </a>
          ) : c.website ? (
            // A website we cannot turn into a safe link is still worth showing —
            // suppressing it would hide a sourced field (§18).
            <span className="inline-flex items-center gap-1.5 truncate">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{c.domain ?? c.website}</span>
            </span>
          ) : null}
          {c.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" aria-hidden="true" />{c.phone}</span> : null}
          {c.email ? <span className="inline-flex items-center gap-1.5 truncate"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{c.email}</span> : null}
          {c.address ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{[c.address, c.postalCode].filter(Boolean).join(", ")}</span> : null}
        </div>
      ) : (
        <p className="text-caption text-subtle">İletişim bilgisi bu aşamada bulunamadı.</p>
      )}

      {/* Social presence — website-verified links (§23) */}
      {socials.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
          <span className="text-subtle">Social:</span>
          {socials.map((s) => (
            <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#2f7a48] hover:underline">
              {s.label} ✓
            </a>
          ))}
        </div>
      ) : null}

      {/* Neden bu lead? — deterministic positive reasons (§7/§10) */}
      {whyPositive.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-sunken px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Neden bu lead?</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {whyPositive.map((r) => (
              <li key={r.key} className="flex items-start gap-1.5 text-caption text-muted">
                <span aria-hidden="true">{r.dot}</span>
                <span><b className="font-medium text-foreground">{r.label}:</b> {r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {c.productFitNote ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-caption text-subtle">{c.productFitNote}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-caption text-subtle">
          <span aria-hidden="true">{fresh.dot}</span> Son kontrol: {fmtDate(c.lastCheckedAt)}
        </span>
        <Link
          href={`/admin/lead-finder/company/${c.id}`}
          className="inline-flex items-center gap-1 text-caption font-semibold text-foreground hover:text-accent"
        >
          Detay <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** Best-effort ISO lookup from a Turkish country label for the flag emoji only.
 *  Purely cosmetic; falls back to a globe when unknown. */
function countryToIso(label: string): string {
  const map: Record<string, string> = {
    Almanya: "DE", Fransa: "FR", Hollanda: "NL", Belçika: "BE", İtalya: "IT",
    İspanya: "ES", Polonya: "PL", İsveç: "SE", Avusturya: "AT", Danimarka: "DK",
    Finlandiya: "FI", Portekiz: "PT", Çekya: "CZ", Romanya: "RO", Yunanistan: "GR",
    Macaristan: "HU", İrlanda: "IE",
  };
  return map[label] ?? "";
}
