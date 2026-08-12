/**
 * Friendly, owner-facing catalog of the editable image slots on the public site.
 *
 * The site renders imagery through a semantic registry (src/config/assets.ts)
 * via the <Media> component. Only the slots ACTUALLY rendered on a page are
 * listed here (the products.* registry keys are unused — products carry their
 * own DB images), each with a Turkish label, the page it lives on, and the
 * aspect ratio it displays at (so the editor preview matches the site).
 */

import type { AssetKey } from "@/config/assets";

export type EditableAsset = {
  key: AssetKey;
  label: string;
  hint?: string;
  /** Preview aspect in the editor — mirrors how the page renders it. */
  aspect: "wide" | "portrait" | "video";
};

export type AssetGroup = {
  title: string;
  hint?: string;
  assets: EditableAsset[];
};

export const ASSET_GROUPS: readonly AssetGroup[] = [
  {
    title: "Hakkımızda Sayfası",
    hint: "Hakkımızda sayfasındaki iki büyük görsel",
    assets: [
      {
        key: "about.operations",
        label: "Operasyon görseli",
        hint: "“Amacımız” bölümündeki geniş görsel",
        aspect: "wide",
      },
      {
        key: "about.accountability",
        label: "Sorumluluk görseli",
        hint: "“Standartlarımız” bölümündeki dikey görsel",
        aspect: "portrait",
      },
    ],
  },
  {
    title: "Hizmetler Sayfası",
    hint: "Dört hizmet kartının görselleri",
    assets: [
      { key: "services.sourcing", label: "Tedarik görseli", aspect: "wide" },
      { key: "services.distribution", label: "Dağıtım görseli", aspect: "wide" },
      { key: "services.privateLabel", label: "Özel Marka görseli", aspect: "wide" },
      { key: "services.partnerships", label: "Ortaklıklar görseli", aspect: "wide" },
    ],
  },
];

/** Flat list of every editable asset key (for validation). */
export const EDITABLE_ASSET_KEYS: readonly AssetKey[] = ASSET_GROUPS.flatMap((g) =>
  g.assets.map((a) => a.key),
);
