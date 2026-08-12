import "server-only";

import { cache } from "react";
import { db } from "@/lib/db";
import { companyInfo } from "@/config/site";
import { env } from "@/lib/env";
import type { ResolvedSettings, SettingsInput } from "@/config/settings";

/**
 * Site-settings repository. `getSiteSettings` returns a COMPLETE object: any
 * field the owner hasn't overridden falls back to the compiled default, so the
 * public site is identical to before until something is explicitly changed.
 * Wrapped in React `cache` so the footer, contact page and analytics share one
 * query per request.
 */

const ROW_ID = "site";

/** Derive a tel:-safe href from a display phone (keep leading +, digits only). */
function toPhoneHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

const pick = (value: string | null | undefined, fallback: string): string =>
  value && value.trim() ? value.trim() : fallback;

export const getSiteSettings = cache(async (): Promise<ResolvedSettings> => {
  let row: Awaited<ReturnType<typeof db.siteSetting.findUnique>> = null;
  try {
    row = await db.siteSetting.findUnique({ where: { id: ROW_ID } });
  } catch {
    // Table missing / DB hiccup → fall back to compiled defaults, never crash
    // a public page over settings.
    row = null;
  }

  const companyPhone = pick(row?.companyPhone, companyInfo.phone);

  return {
    companyEmail: pick(row?.companyEmail, companyInfo.email),
    companyPhone,
    companyPhoneHref: toPhoneHref(companyPhone),
    companyLocation: pick(row?.companyLocation, companyInfo.location),
    hoursShort: pick(row?.hoursShort, companyInfo.hoursShort),
    hoursLong: pick(row?.hoursLong, companyInfo.hoursLong),
    linkedin: pick(row?.linkedin, ""),
    instagram: pick(row?.instagram, ""),
    x: pick(row?.x, ""),
    youtube: pick(row?.youtube, ""),
    facebook: pick(row?.facebook, ""),
    ga4Id: pick(row?.ga4Id, env.analytics.ga4Id ?? ""),
    clarityId: pick(row?.clarityId, env.analytics.clarityId ?? ""),
  };
});

/** Persist overrides. Empty strings are stored as null → fall back to default. */
export async function updateSiteSettings(input: SettingsInput): Promise<void> {
  const norm = (v: string) => (v.trim() ? v.trim() : null);
  const data = {
    companyEmail: norm(input.companyEmail),
    companyPhone: norm(input.companyPhone),
    companyLocation: norm(input.companyLocation),
    hoursShort: norm(input.hoursShort),
    hoursLong: norm(input.hoursLong),
    linkedin: norm(input.linkedin),
    instagram: norm(input.instagram),
    x: norm(input.x),
    youtube: norm(input.youtube),
    facebook: norm(input.facebook),
    ga4Id: norm(input.ga4Id),
    clarityId: norm(input.clarityId),
  };
  await db.siteSetting.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...data },
    update: data,
  });
}
