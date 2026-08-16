"use client";

import { useActionState } from "react";
import { Telescope } from "lucide-react";
import { deepDiveAction, type DeepDiveState } from "@/app/(admin)/admin/(dashboard)/lead-finder/actions";
import { BrandLoader } from "@/components/ui/brand-loader";

/**
 * "Derin analiz" — spend real reading time on the three leads worth a call.
 *
 * The wording never promises names. A deep read on a large chain routinely ends
 * with a legal entity, a VAT number and a switchboard and no named person at
 * all, because that is what those firms publish; saying so plainly is the point.
 * What the button promises is that we will go and look, and report exactly what
 * was there.
 */
export function DeepDive({ searchId, targets }: { searchId: string; targets: string[] }) {
  const [state, action, running] = useActionState<DeepDiveState, FormData>(deepDiveAction, {});

  if (targets.length === 0) return null;

  return (
    <form action={action} className="mt-4 rounded-xl border border-border bg-surface-sunken p-4">
      <input type="hidden" name="searchId" value={searchId} />

      {running ? (
        <div className="flex items-center gap-4">
          <BrandLoader size="sm" label="Derin analiz çalışıyor" />
          <div>
            <p className="text-small font-medium text-foreground">Derin analiz çalışıyor…</p>
            <p className="text-caption text-subtle">
              {targets.join(" · ")} — yasal sayfaları okunuyor, vergi numarası doğrulanıyor.
              Bu 15–40 saniye sürebilir.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-small font-medium text-foreground">
              En umut verici 3 lead için derin analiz
            </p>
            <p className="text-caption text-subtle">
              {targets.join(" · ")} — kim yönetiyor, kime ulaşılır, yasal ünvan ve vergi numarası.
              Sitesi olmayan zincirlerde resmi adres Wikidata kaydından bulunur.
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy-950 px-4 py-2 text-caption font-medium text-white transition-opacity hover:opacity-90"
          >
            <Telescope className="size-4" aria-hidden="true" />
            Derin analiz yap
          </button>
        </div>
      )}

      {state.error ? (
        <p className="mt-3 text-caption text-[#8a2b2b]">{state.error}</p>
      ) : state.attempted != null && !running ? (
        <p className="mt-3 text-caption text-subtle">
          {state.attempted} firma incelendi · <b className="font-medium text-[#2f7a48]">{state.read}</b> sitesi
          okundu · <b className="font-medium text-[#2f7a48]">{state.named}</b> firmada isimli muhatap bulundu
          {state.unreachable ? ` · ${state.unreachable} firmaya ulaşılamadı` : null}
          {state.named === 0 && state.read ? (
            <> — isimli muhatap yayınlamamışlar; bu büyük zincirlerde olağandır, aşağıda ne bulduğumuz yazıyor.</>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
