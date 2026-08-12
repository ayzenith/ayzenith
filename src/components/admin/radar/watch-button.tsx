"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, Check, Loader2 } from "lucide-react";
import {
  addWatchAction,
  type WatchState,
} from "@/app/(admin)/admin/(dashboard)/radar/actions";

/**
 * "Pazarı Takibe Al" — adds this market to the weekly-tracked watch list.
 * Idempotent on the backend (upsert), so re-clicking is safe.
 */
export function WatchButton({
  categoryKey,
  countryCode,
  alreadyWatched,
}: {
  categoryKey: string;
  countryCode: string;
  alreadyWatched: boolean;
}) {
  const [state, formAction, pending] = useActionState<WatchState, FormData>(addWatchAction, {});
  const [done, setDone] = useState(alreadyWatched);

  useEffect(() => {
    if (state.ok) setDone(true);
  }, [state.ok]);

  if (done) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#bcd8c4] bg-[#eaf3ec] px-5 text-small font-semibold text-[#2f7a48]">
        <Check className="size-4" aria-hidden="true" /> Takibe alındı
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="categoryKey" value={categoryKey} />
      <input type="hidden" name="countryCode" value={countryCode} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-small font-semibold text-foreground transition-colors hover:border-accent/50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" aria-hidden="true" />}
        Pazarı Takibe Al
      </button>
    </form>
  );
}
