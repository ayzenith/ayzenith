import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Locale } from "@/i18n/routing";

/**
 * Content-override repository. `getLocaleOverrides` is read on EVERY public page
 * (via i18n/request.ts), so it is wrapped in `unstable_cache` and tagged; saving
 * an override busts the tag. It also fails safe: any DB problem returns an empty
 * override map so the site simply falls back to the compiled catalog.
 */

export const CONTENT_TAG = "content-overrides";

export type OverrideRow = {
  key: string;
  en: string | null;
  tr: string | null;
  de: string | null;
};

/** Flat { key: value } map of overrides for one locale (cached + tagged). */
export const getLocaleOverrides = unstable_cache(
  async (locale: Locale): Promise<Record<string, string>> => {
    try {
      const rows = await db.contentOverride.findMany();
      const map: Record<string, string> = {};
      for (const row of rows) {
        const value = row[locale];
        if (value && value.trim()) map[row.key] = value;
      }
      return map;
    } catch {
      return {};
    }
  },
  ["content-overrides"],
  { tags: [CONTENT_TAG] },
);

/** All override rows — for the CMS editor. */
export async function listOverrides(): Promise<OverrideRow[]> {
  const rows = await db.contentOverride.findMany();
  return rows.map((r) => ({ key: r.key, en: r.en, tr: r.tr, de: r.de }));
}

/** Upsert one leaf's three languages. Empty strings clear that language; if all
 *  three end up empty the row is removed (→ full fallback to defaults). */
export async function saveOverride(
  key: string,
  values: { en: string; tr: string; de: string },
): Promise<void> {
  const norm = (v: string) => (v.trim() ? v.trim() : null);
  const data = { en: norm(values.en), tr: norm(values.tr), de: norm(values.de) };

  if (!data.en && !data.tr && !data.de) {
    await db.contentOverride.deleteMany({ where: { key } });
    return;
  }
  await db.contentOverride.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
}
