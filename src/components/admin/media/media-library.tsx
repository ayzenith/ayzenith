"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Trash2, Pencil, Check, X, Link2 } from "lucide-react";
import { UploadZone } from "./upload-zone";
import { formatBytes, type MediaDTO } from "@/config/media";
import {
  deleteMediaAction,
  renameMediaAction,
} from "@/app/(admin)/admin/(dashboard)/media/actions";

/**
 * Media Library — upload, search, rename, delete. State lives here so uploads
 * and edits reflect instantly; the server actions persist each change.
 */
export function MediaLibrary({ initial }: { initial: MediaDTO[] }) {
  const [items, setItems] = useState<MediaDTO[]>(initial);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((m) => m.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  function onUploaded(assets: MediaDTO[]) {
    setItems((prev) => [...assets, ...prev]);
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => void deleteMediaAction(fd));
  }

  function rename(id: string, name: string) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
    const fd = new FormData();
    fd.set("id", id);
    fd.set("name", name);
    startTransition(() => void renameMediaAction(fd));
  }

  return (
    <div className="flex flex-col gap-6">
      <UploadZone onUploaded={onUploaded} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Görsellerde ara…"
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-small text-foreground outline-none transition-colors focus:border-accent"
          />
        </div>
        <span className="shrink-0 text-caption text-subtle">{filtered.length} görsel</span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-small text-subtle">
          {items.length === 0 ? "Henüz görsel yüklenmedi." : "Aramanıza uygun görsel yok."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <MediaCard key={m.id} item={m} onDelete={remove} onRename={rename} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaCard({
  item,
  onDelete,
  onRename,
}: {
  item: MediaDTO;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    void navigator.clipboard?.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="group overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square bg-surface-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.name} className="size-full object-cover" loading="lazy" />
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copyUrl}
            title="Adresi kopyala"
            className="inline-flex size-7 items-center justify-center rounded-md bg-surface/90 text-muted shadow-sm backdrop-blur hover:text-foreground"
          >
            {copied ? <Check className="size-3.5 text-[#2f7a48]" /> : <Link2 className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Yeniden adlandır"
            className="inline-flex size-7 items-center justify-center rounded-md bg-surface/90 text-muted shadow-sm backdrop-blur hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Sil"
            className="inline-flex size-7 items-center justify-center rounded-md bg-surface/90 text-muted shadow-sm backdrop-blur hover:text-[#8a2b2b]"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {confirming ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-950/70 p-3 text-center backdrop-blur-sm">
            <p className="text-caption font-medium text-white">Bu görsel silinsin mi?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="inline-flex h-8 items-center rounded-md bg-[#8a2b2b] px-3 text-caption font-semibold text-white hover:opacity-90"
              >
                Sil
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex h-8 items-center rounded-md bg-surface px-3 text-caption font-medium text-foreground"
              >
                Vazgeç
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-2.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(item.id, draft.trim() || item.name);
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-caption text-foreground outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                onRename(item.id, draft.trim() || item.name);
                setEditing(false);
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-[#2f7a48]"
              aria-label="Kaydet"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(item.name);
                setEditing(false);
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted"
              aria-label="Vazgeç"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <p className="truncate text-caption font-medium text-foreground" title={item.name}>
              {item.name}
            </p>
            <p className="text-[11px] text-subtle">{formatBytes(item.size)}</p>
          </>
        )}
      </div>
    </li>
  );
}
