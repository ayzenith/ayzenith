import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { loadBaseMessages } from "@/server/messages";
import { listOverrides } from "@/server/content";
import { listAssetOverrides } from "@/server/assets";
import { listMedia } from "@/server/media";
import { PageHeader } from "@/components/admin/page-header";
import { ContentWorkspace } from "@/components/admin/content/content-workspace";
import { type EditorGroup, type EditorField } from "@/components/admin/content/content-editor";
import { flattenMessages, getPath } from "@/lib/content-merge";
import { CONTENT_GROUPS, humanizeKey } from "@/config/content-schema";
import { ASSET_GROUPS } from "@/config/asset-schema";

export const metadata: Metadata = { title: "Sayfalar & Metinler · AYZENITH" };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  await requireUser();

  const [tr, en, de, overrides, assetOverrideRows, library] = await Promise.all([
    loadBaseMessages("tr"),
    loadBaseMessages("en"),
    loadBaseMessages("de"),
    listOverrides(),
    listAssetOverrides(),
    listMedia(),
  ]);

  const assetOverrides: Record<string, string> = {};
  for (const row of assetOverrideRows) assetOverrides[row.key] = row.url;

  const ovMap = new Map(overrides.map((o) => [o.key, o]));

  // Build fields grouped by top-level namespace, using TR as the reference set.
  const fieldsByNs = new Map<string, EditorField[]>();
  for (const { key } of flattenMessages(tr)) {
    const ns = key.split(".")[0] ?? key;
    const ov = ovMap.get(key);
    const field: EditorField = {
      key,
      label: humanizeKey(key),
      def: {
        tr: getPath(tr, key) ?? "",
        en: getPath(en, key) ?? "",
        de: getPath(de, key) ?? "",
      },
      ov: ov ? { tr: ov.tr, en: ov.en, de: ov.de } : null,
    };
    const list = fieldsByNs.get(ns);
    if (list) list.push(field);
    else fieldsByNs.set(ns, [field]);
  }

  // Order groups per the friendly schema, then any leftovers alphabetically.
  const ordered = new Set(CONTENT_GROUPS.map((g) => g.ns));
  const groups: EditorGroup[] = [];
  for (const g of CONTENT_GROUPS) {
    const fields = fieldsByNs.get(g.ns);
    if (fields && fields.length) groups.push({ title: g.title, hint: g.hint, fields });
  }
  for (const ns of [...fieldsByNs.keys()].sort()) {
    if (!ordered.has(ns)) {
      groups.push({ title: ns, fields: fieldsByNs.get(ns)! });
    }
  }

  const overriddenCount = overrides.length;

  return (
    <>
      <PageHeader
        title="Sayfalar & Metinler"
        description="Sitedeki tüm yazıları üç dilde düzenleyin ve sayfa görsellerini değiştirin. Kaydettiğiniz an sitede güncellenir."
      />
      <ContentWorkspace
        textGroups={groups}
        overriddenCount={overriddenCount}
        assetGroups={ASSET_GROUPS}
        assetOverrides={assetOverrides}
        library={library}
      />
    </>
  );
}
