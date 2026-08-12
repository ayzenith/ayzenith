"use client";

import { useState } from "react";
import { ImagePlus, X, Check, Trash2 } from "lucide-react";
import { UploadZone } from "./upload-zone";
import type { MediaDTO } from "@/config/media";

/**
 * Media picker used inside the product editor. Opens a modal to pick from the
 * library or upload new images. Works in single (main image) or multiple
 * (gallery) mode. Newly uploaded assets bubble up via `onUploaded` so the parent
 * keeps one shared, growing library list.
 */
type CommonProps = {
  library: MediaDTO[];
  onUploaded: (assets: MediaDTO[]) => void;
};

export function SingleImagePicker({
  value,
  onChange,
  library,
  onUploaded,
}: CommonProps & { value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {value ? (
        <div className="relative w-full overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Seçilen görsel" className="aspect-video w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-navy-950/70 text-white backdrop-blur hover:bg-navy-950"
            aria-label="Görseli kaldır"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-small font-medium text-foreground transition-colors hover:border-accent/50"
      >
        <ImagePlus className="size-4" aria-hidden="true" /> {value ? "Görseli değiştir" : "Görsel seç"}
      </button>

      {open ? (
        <PickerModal
          library={library}
          onUploaded={onUploaded}
          selected={value ? [value] : []}
          onToggle={(url) => {
            onChange(url);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          multiple={false}
        />
      ) : null}
    </div>
  );
}

export function GalleryPicker({
  value,
  onChange,
  library,
  onUploaded,
}: CommonProps & { value: string[]; onChange: (urls: string[]) => void }) {
  const [open, setOpen] = useState(false);

  function toggle(url: string) {
    onChange(value.includes(url) ? value.filter((u) => u !== url) : [...value, url]);
  }

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2 grid grid-cols-3 gap-2">
          {value.map((url) => (
            <li key={url} className="relative overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => toggle(url)}
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded bg-navy-950/70 text-white backdrop-blur hover:bg-navy-950"
                aria-label="Kaldır"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-small font-medium text-foreground transition-colors hover:border-accent/50"
      >
        <ImagePlus className="size-4" aria-hidden="true" /> Galeriye görsel ekle
      </button>

      {open ? (
        <PickerModal
          library={library}
          onUploaded={onUploaded}
          selected={value}
          onToggle={toggle}
          onClose={() => setOpen(false)}
          multiple
        />
      ) : null}
    </div>
  );
}

function PickerModal({
  library,
  onUploaded,
  selected,
  onToggle,
  onClose,
  multiple,
}: {
  library: MediaDTO[];
  onUploaded: (assets: MediaDTO[]) => void;
  selected: string[];
  onToggle: (url: string) => void;
  onClose: () => void;
  multiple: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-h6 font-semibold text-foreground">
            {multiple ? "Galeri görselleri seç" : "Görsel seç"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <UploadZone compact onUploaded={onUploaded} />

          {library.length === 0 ? (
            <p className="mt-5 text-center text-small text-subtle">
              Kütüphanede görsel yok. Yukarıdan yükleyin.
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {library.map((m) => {
                const isSel = selected.includes(m.url);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(m.url)}
                      className={
                        "relative block aspect-square w-full overflow-hidden rounded-lg border-2 transition-colors " +
                        (isSel ? "border-accent" : "border-transparent hover:border-border")
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.name} className="size-full object-cover" loading="lazy" />
                      {isSel ? (
                        <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-accent text-white">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {multiple ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg bg-navy-950 px-4 text-small font-semibold text-white hover:opacity-90"
            >
              Bitti ({selected.length})
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
