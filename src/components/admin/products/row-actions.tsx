"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import type { ProductStatusValue } from "@/config/product-admin";
import { STATUS_OPTIONS } from "@/config/product-options";
import {
  deleteProductAction,
  setProductStatusAction,
} from "@/app/(admin)/admin/(dashboard)/products/actions";

/**
 * Per-row actions for the product list: edit link, an inline status switch
 * (Draft / Published / Hidden) and a guarded delete. Server actions do the work;
 * this client island only adds the confirm dialog and the pending state.
 */
export function RowActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: ProductStatusValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function changeStatus(next: string) {
    if (next === status) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    startTransition(async () => {
      await setProductStatusAction(fd);
      router.refresh();
    });
  }

  function remove() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteProductAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <select
        aria-label={`${name} durumu`}
        value={status}
        disabled={pending}
        onChange={(e) => changeStatus(e.target.value)}
        className="h-8 rounded-md border border-border bg-surface px-2 text-caption text-foreground outline-none focus:border-accent disabled:opacity-60"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <Link
        href={`/admin/products/${id}`}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        aria-label={`${name} düzenle`}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Link>

      {confirming ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex h-8 items-center rounded-md bg-[#8a2b2b] px-2.5 text-caption font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Sil
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-caption text-foreground"
          >
            Vazgeç
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-[#e0b4b4] hover:text-[#8a2b2b]"
          aria-label={`${name} sil`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
