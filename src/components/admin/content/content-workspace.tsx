"use client";

import { useState } from "react";
import { FileText, ImageIcon } from "lucide-react";
import { ContentEditor, type EditorGroup } from "./content-editor";
import { AssetEditor } from "./asset-editor";
import type { MediaDTO } from "@/config/media";
import type { AssetGroup } from "@/config/asset-schema";

/**
 * Tabbed shell for the "Sayfalar & Metinler" panel: "Metinler" (all site copy in
 * three languages) and "Görseller" (swap the image in each page slot). Keeps the
 * two editors visually one place while avoiding a single very long scroll.
 */
type Tab = "text" | "image";

export function ContentWorkspace({
  textGroups,
  overriddenCount,
  assetGroups,
  assetOverrides,
  library,
}: {
  textGroups: EditorGroup[];
  overriddenCount: number;
  assetGroups: readonly AssetGroup[];
  assetOverrides: Record<string, string>;
  library: MediaDTO[];
}) {
  const [tab, setTab] = useState<Tab>("text");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        <TabButton active={tab === "text"} onClick={() => setTab("text")} icon={<FileText className="size-4" />}>
          Metinler
        </TabButton>
        <TabButton active={tab === "image"} onClick={() => setTab("image")} icon={<ImageIcon className="size-4" />}>
          Görseller
        </TabButton>
      </div>

      {tab === "text" ? (
        <ContentEditor groups={textGroups} overriddenCount={overriddenCount} />
      ) : (
        <AssetEditor groups={assetGroups} overrides={assetOverrides} library={library} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-small font-semibold transition-colors sm:flex-none sm:px-5 " +
        (active
          ? "bg-navy-950 text-white"
          : "text-muted hover:bg-surface-sunken hover:text-foreground")
      }
    >
      {icon}
      {children}
    </button>
  );
}
