"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { continueVerificationAction, type ContinueVerifyState } from "@/app/(admin)/admin/(dashboard)/lead-finder/actions";

/**
 * "Doğrulamaya devam et" — pushes a search's unchecked firms through website
 * verification, one bounded batch at a time (§V3.4).
 *
 * Shown only while a search still has firms nobody has looked at. The wording
 * deliberately says how many are LEFT rather than promising a result, because a
 * batch may well find nothing new: some sites are simply unreachable, and that
 * is an honest outcome, not a failure.
 */
export function ContinueVerify({ searchId, pending }: { searchId: string; pending: number }) {
  const [state, action, isRunning] = useActionState<ContinueVerifyState, FormData>(
    continueVerificationAction,
    {},
  );

  const left = state.remaining ?? pending;
  if (left <= 0 && state.attempted == null) return null;

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
      <input type="hidden" name="searchId" value={searchId} />
      {left > 0 ? (
        <button
          type="submit"
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-1.5 text-caption font-medium text-foreground transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${isRunning ? "animate-spin" : ""}`} aria-hidden="true" />
          {isRunning ? "Doğrulanıyor…" : `Doğrulamaya devam et (${left} firma bekliyor)`}
        </button>
      ) : null}

      {state.error ? (
        <span className="text-caption text-[#8a2b2b]">{state.error}</span>
      ) : state.attempted != null ? (
        <span className="text-caption text-subtle">
          {state.attempted} firma kontrol edildi · <b className="font-medium text-[#2f7a48]">{state.reachable}</b> site yanıt verdi
          {state.remaining === 0 ? " · tüm firmalar kontrol edildi" : null}
        </span>
      ) : null}

      {isRunning ? (
        <span className="text-caption text-subtle">Bu birkaç dakika sürebilir; sayfadan ayrılmayın.</span>
      ) : null}
    </form>
  );
}
