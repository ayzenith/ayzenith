import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { AssetKey } from "@/config/assets";

/**
 * Asset-override repository. Mirrors the content-override system but for images:
 * `getAssetOverrides` is read by every <Media> render, so it is cached and
 * tagged; saving an override busts the tag. It fails safe — any DB problem
 * returns an empty map so the site simply falls back to the compiled
 * placeholder/registry default.
 */

export const ASSET_TAG = "asset-overrides";

export type AssetOverrideRow = { key: string; url: string };

/** Flat { key: url } map of all image overrides (cached + tagged). */
export const getAssetOverrides = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const rows = await db.assetOverride.findMany();
      const map: Record<string, string> = {};
      for (const row of rows) {
        if (row.url && row.url.trim()) map[row.key] = row.url;
      }
      return map;
    } catch {
      return {};
    }
  },
  ["asset-overrides"],
  { tags: [ASSET_TAG] },
);

/** All override rows — for the CMS editor. */
export async function listAssetOverrides(): Promise<AssetOverrideRow[]> {
  const rows = await db.assetOverride.findMany();
  return rows.map((r) => ({ key: r.key, url: r.url }));
}

/** Set (or clear) one asset's override. An empty url removes the row → the slot
 *  falls back to the compiled placeholder/default. */
export async function saveAssetOverride(
  key: AssetKey,
  url: string,
): Promise<void> {
  const clean = url.trim();
  if (!clean) {
    await db.assetOverride.deleteMany({ where: { key } });
    return;
  }
  await db.assetOverride.upsert({
    where: { key },
    create: { key, url: clean },
    update: { url: clean },
  });
}
