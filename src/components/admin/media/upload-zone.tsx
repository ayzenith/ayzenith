"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { uploadFiles } from "./upload";
import type { MediaDTO } from "@/config/media";

/**
 * Shared drag-and-drop upload zone. Handles the file input, drag styling, the
 * pending state and errors; hands successful uploads back to the parent.
 */
export function UploadZone({
  onUploaded,
  compact = false,
}: {
  onUploaded: (assets: MediaDTO[]) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setBusy(true);
    const result = await uploadFiles(Array.from(fileList));
    setBusy(false);
    if (result.ok) {
      onUploaded(result.assets);
    } else {
      setError(result.error);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors " +
          (compact ? "p-5" : "p-8") +
          (dragging ? " border-accent bg-accent/5" : " border-border bg-surface-sunken hover:border-accent/50")
        }
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-6 text-subtle" aria-hidden="true" />
        )}
        <span className="text-small font-medium text-foreground">
          {busy ? "Yükleniyor…" : "Görselleri buraya sürükleyin veya tıklayıp seçin"}
        </span>
        {!compact ? (
          <span className="text-caption text-subtle">PNG, JPG, WEBP, AVIF, GIF, SVG · en fazla 10 MB</span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error ? (
        <p className="mt-2 text-caption text-[#8a2b2b]">{error}</p>
      ) : null}
    </div>
  );
}
