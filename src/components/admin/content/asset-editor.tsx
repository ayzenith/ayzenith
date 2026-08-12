"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon } from "lucide-react";
import { SingleImagePicker } from "@/components/admin/media/media-picker";
import { saveAssetAction } from "@/app/(admin)/admin/(dashboard)/content/asset-actions";
import type { MediaDTO } from "@/config/media";
import type { AssetGroup, EditableAsset } from "@/config/asset-schema";

/**
 * "Görseller" panel — swaps the image shown in each semantic slot on the public
 * site. Reuses the product editor's SingleImagePicker (pick from library or
 * upload). Choosing an image saves immediately and it appears on the site; the
 * built-in remove (trash) clears the override → the slot returns to its original
 * on-brand placeholder.
 */
export function AssetEditor({
  groups,
  overrides,
  library: initialLibrary,
}: {
  groups: readonly AssetGroup[];
  overrides: Record<string, string>;
  library: MediaDTO[];
}) {
  // One shared, growing library list so uploads in any slot are reusable.
  const [library, setLibrary] = useState<MediaDTO[]>(initialLibrary);
  const onUploaded = (assets: MediaDTO[]) =>
    setLibrary((prev) => [...assets, ...prev.filter((p) => !assets.some((a) => a.id === p.id))]);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-sans text-body font-semibold text-foreground">{group.title}</h2>
            {group.hint ? <p className="mt-0.5 text-caption text-subtle">{group.hint}</p> : null}
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            {group.assets.map((asset) => (
              <AssetSlot
                key={asset.key}
                asset={asset}
                initialUrl={overrides[asset.key] ?? ""}
                library={library}
                onUploaded={onUploaded}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssetSlot({
  asset,
  initialUrl,
  library,
  onUploaded,
}: {
  asset: EditableAsset;
  initialUrl: string;
  library: MediaDTO[];
  onUploaded: (assets: MediaDTO[]) => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function persist(nextUrl: string) {
    const prev = url;
    setUrl(nextUrl);
    setError(null);
    const fd = new FormData();
    fd.set("key", asset.key);
    fd.set("url", nextUrl);
    startTransition(async () => {
      const res = await saveAssetAction(fd);
      if (!res.ok) {
        setUrl(prev); // roll back on failure
        setError(res.error ?? "Kaydedilemedi.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-small font-medium text-foreground">{asset.label}</span>
        {url ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-caption font-medium text-accent">
            değiştirildi
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-caption text-subtle">
            <ImageIcon className="size-3" /> orijinal
          </span>
        )}
        {saved ? (
          <span className="inline-flex items-center gap-1 text-caption text-accent">
            <Check className="size-3" /> kaydedildi
          </span>
        ) : null}
        {pending ? <span className="text-caption text-subtle">kaydediliyor…</span> : null}
      </div>
      {asset.hint ? <p className="mb-2 text-caption text-subtle">{asset.hint}</p> : null}

      <SingleImagePicker
        value={url}
        onChange={persist}
        library={library}
        onUploaded={onUploaded}
      />

      {!url ? (
        <p className="mt-1.5 text-caption text-subtle">
          Şu an marka desenli varsayılan görsel kullanılıyor. Bir görsel seçerseniz sitede onunla değişir.
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-caption text-[#8a2b2b]">{error}</p> : null}
    </div>
  );
}
