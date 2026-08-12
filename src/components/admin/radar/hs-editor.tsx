"use client";

import { useActionState, useEffect, useState } from "react";
import { useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  createHsMappingAction,
  updateHsMappingAction,
  deleteHsMappingAction,
  type HsFormState,
} from "@/app/(admin)/admin/(dashboard)/radar/hs/actions";
import { cn } from "@/lib/utils";

export type HsRow = {
  id: string;
  categoryKey: string;
  hs6: string;
  productGroup: string;
  verification: "VERIFIED" | "NEEDS_REVIEW";
  source: string | null;
  note: string | null;
};
export type CategoryOpt = { key: string; label: string };

const inputCls =
  "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-small text-foreground outline-none focus:border-accent";

function VerifBadge({ v }: { v: HsRow["verification"] }) {
  if (v === "VERIFIED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf3ec] px-2 py-0.5 text-[11px] font-semibold text-[#2f7a48]">
        <ShieldCheck className="size-3" /> Doğrulandı
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f8f1dc] px-2 py-0.5 text-[11px] font-semibold text-[#8a6d1f]">
      <AlertTriangle className="size-3" /> Doğrulama gerekli
    </span>
  );
}

function EditRow({ row, onDone }: { row: HsRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<HsFormState, FormData>(updateHsMappingAction, {});
  useEffect(() => { if (state.ok) onDone(); }, [state.ok, onDone]);
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-accent/40 bg-surface-sunken p-3 sm:grid-cols-[7rem_1fr_9rem_auto]">
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="categoryKey" value={row.categoryKey} />
      <input name="hs6" defaultValue={row.hs6} placeholder="851830" className={inputCls} />
      <input name="productGroup" defaultValue={row.productGroup} placeholder="Ürün grubu" className={inputCls} />
      <select name="verification" defaultValue={row.verification} className={inputCls}>
        <option value="VERIFIED">Doğrulandı</option>
        <option value="NEEDS_REVIEW">Doğrulama gerekli</option>
      </select>
      <div className="flex items-center gap-1">
        <input name="source" defaultValue={row.source ?? ""} placeholder="Kaynak" className={cn(inputCls, "hidden")} />
        <button type="submit" disabled={pending} className="inline-flex size-9 items-center justify-center rounded-md bg-navy-950 text-white hover:opacity-90 disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button type="button" onClick={onDone} className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {state.error ? <p className="text-caption text-[#8a2b2b] sm:col-span-4">{state.error}</p> : null}
    </form>
  );
}

function ViewRow({ row, onEdit }: { row: HsRow; onEdit: () => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 py-2.5">
      <code className="shrink-0 rounded bg-surface-sunken px-2 py-0.5 font-mono text-small text-foreground">{row.hs6}</code>
      <div className="min-w-0 flex-1">
        <p className="truncate text-small text-foreground">{row.productGroup}</p>
        {row.source ? <p className="truncate text-caption text-subtle">{row.source}</p> : null}
      </div>
      <VerifBadge v={row.verification} />
      <button onClick={onEdit} className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground" title="Düzenle">
        <Pencil className="size-4" />
      </button>
      <button
        onClick={() => { if (confirm(`${row.hs6} kodunu silmek istediğinize emin misiniz?`)) start(() => { const fd = new FormData(); fd.set("id", row.id); return deleteHsMappingAction(fd); }); }}
        disabled={pending}
        className="rounded-md p-1.5 text-subtle hover:bg-[#fbeaea] hover:text-[#8a2b2b] disabled:opacity-50"
        title="Sil"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
    </div>
  );
}

function AddForm({ categoryKey }: { categoryKey: string }) {
  const [state, action, pending] = useActionState<HsFormState, FormData>(createHsMappingAction, {});
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.ok) setOpen(false); }, [state.ok]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-small font-medium text-foreground hover:border-accent/50">
        <Plus className="size-4" /> HS Kodu Ekle
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 grid gap-2 rounded-lg border border-border bg-surface-sunken p-3 sm:grid-cols-[7rem_1fr_9rem_auto]">
      <input type="hidden" name="categoryKey" value={categoryKey} />
      <input name="hs6" placeholder="851830" className={inputCls} />
      <input name="productGroup" placeholder="Ürün grubu (ör. Kulaklıklar)" className={inputCls} />
      <select name="verification" defaultValue="NEEDS_REVIEW" className={inputCls}>
        <option value="NEEDS_REVIEW">Doğrulama gerekli</option>
        <option value="VERIFIED">Doğrulandı</option>
      </select>
      <div className="flex items-center gap-1">
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-1 rounded-md bg-navy-950 px-3 text-small font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Ekle
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <input name="source" placeholder="Kaynak (ör. WCO HS 2022)" className={cn(inputCls, "sm:col-span-4")} />
      {state.error ? (
        <p className="inline-flex items-center gap-1.5 text-caption text-[#8a2b2b] sm:col-span-4"><AlertCircle className="size-3.5" /> {state.error}</p>
      ) : null}
      <p className="text-caption text-subtle sm:col-span-4">
        Bir koddan emin değilseniz “Doğrulama gerekli” bırakın — bu kodlar analize girmez.
      </p>
    </form>
  );
}

export function HsEditor({ categories, rows }: { categories: CategoryOpt[]; rows: HsRow[] }) {
  const [cat, setCat] = useState(categories[0]?.key ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);

  const inCat = rows.filter((r) => r.categoryKey === cat);
  const verified = inCat.filter((r) => r.verification === "VERIFIED");
  const review = inCat.filter((r) => r.verification === "NEEDS_REVIEW");

  return (
    <div>
      {/* Category selector */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const count = rows.filter((r) => r.categoryKey === c.key).length;
          return (
            <button
              key={c.key}
              onClick={() => { setCat(c.key); setEditingId(null); }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-small font-medium transition-colors",
                cat === c.key ? "border-navy-950 bg-navy-950 text-white" : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              {c.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface p-6">
        {/* Verified group */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[#2f7a48]" />
          <h3 className="text-small font-semibold text-foreground">Doğrulanmış kodlar</h3>
          <span className="text-caption text-subtle">— analizlerde kullanılır</span>
        </div>
        {verified.length === 0 ? (
          <p className="mt-2 text-small text-subtle">Bu kategoride doğrulanmış kod yok.</p>
        ) : (
          <div className="mt-2 divide-y divide-border">
            {verified.map((r) => editingId === r.id
              ? <EditRow key={r.id} row={r} onDone={() => setEditingId(null)} />
              : <ViewRow key={r.id} row={r} onEdit={() => setEditingId(r.id)} />)}
          </div>
        )}

        {/* Needs review group */}
        <div className="mt-6 flex items-center gap-2">
          <AlertTriangle className="size-4 text-[#8a6d1f]" />
          <h3 className="text-small font-semibold text-foreground">Doğrulama gerekli</h3>
          <span className="text-caption text-subtle">— analize girmez</span>
        </div>
        {review.length === 0 ? (
          <p className="mt-2 text-small text-subtle">Bekleyen kod yok.</p>
        ) : (
          <div className="mt-2 divide-y divide-border">
            {review.map((r) => editingId === r.id
              ? <EditRow key={r.id} row={r} onDone={() => setEditingId(null)} />
              : <ViewRow key={r.id} row={r} onEdit={() => setEditingId(r.id)} />)}
          </div>
        )}

        <AddForm categoryKey={cat} />
      </div>
    </div>
  );
}
