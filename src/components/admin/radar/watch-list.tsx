"use client";

import { useTransition } from "react";
import Link from "next/link";
import { RefreshCw, Trash2, Loader2, ArrowRight } from "lucide-react";
import {
  refreshWatchAction,
  removeWatchAction,
} from "@/app/(admin)/admin/(dashboard)/radar/actions";
import { ScoreChip } from "./score-badge";
import { fmtDate, type Decision } from "./ui";

export type WatchItem = {
  id: string;
  label: string;
  lastScore: number | null;
  lastSnapshotId: string | null;
  lastRefreshedAt: string | null;
  decision: Decision;
};

function Row({ w }: { w: WatchItem }) {
  const [pending, start] = useTransition();

  return (
    <li className="flex items-center gap-3 py-3">
      <ScoreChip decision={w.decision} score={w.lastScore} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-foreground">{w.label}</p>
        <p className="text-caption text-subtle">
          {w.lastRefreshedAt ? `Son güncelleme: ${fmtDate(w.lastRefreshedAt)}` : "Henüz yenilenmedi"}
        </p>
      </div>
      {w.lastSnapshotId ? (
        <Link
          href={`/admin/radar/analysis/${w.lastSnapshotId}`}
          className="hidden rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground sm:inline-flex"
          title="Son analizi gör"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => {
          const fd = new FormData();
          fd.set("id", w.id);
          return refreshWatchAction(fd);
        })}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-caption font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-60"
        title="Şimdi Yenile"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Şimdi Yenile
      </button>
      <button
        type="button"
        onClick={() => start(() => {
          const fd = new FormData();
          fd.set("id", w.id);
          return removeWatchAction(fd);
        })}
        className="rounded-md p-1.5 text-subtle hover:bg-[#fbeaea] hover:text-[#8a2b2b]"
        title="Takipten çıkar"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function WatchList({ items }: { items: WatchItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 text-small text-subtle">
        Henüz takip ettiğiniz pazar yok. Bir analizin sonucundan “Pazarı Takibe Al” diyebilirsiniz.
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y divide-border">
      {items.map((w) => <Row key={w.id} w={w} />)}
    </ul>
  );
}
