"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, Check } from "lucide-react";
import {
  CONTACT_STATUS_LABEL,
  type ContactStatusValue,
} from "@/config/contact-labels";
import {
  setContactStatusAction,
  saveContactNotesAction,
  deleteContactAction,
} from "@/app/(admin)/admin/(dashboard)/contacts/actions";

const STATUSES: ContactStatusValue[] = ["NEW", "READ", "ARCHIVED"];

/** Status switch, internal notes and delete for a single inquiry. */
export function ContactDetailActions({
  id,
  status: initialStatus,
  notes: initialNotes,
}: {
  id: string;
  status: ContactStatusValue;
  notes: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [confirming, setConfirming] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: ContactStatusValue) {
    setStatus(next);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    startTransition(async () => {
      await setContactStatusAction(fd);
      router.refresh();
    });
  }

  function saveNotes() {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("notes", notes);
    startTransition(async () => {
      await saveContactNotesAction(fd);
      setSavedNotes(notes);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 1500);
    });
  }

  function remove() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => void deleteContactAction(fd));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-caption font-medium uppercase tracking-wide text-subtle">Durum</p>
        <div className="mt-2 flex gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeStatus(s)}
              disabled={pending}
              className={
                "inline-flex h-9 items-center rounded-lg border px-3 text-small font-medium transition-colors disabled:opacity-60 " +
                (status === s
                  ? "border-navy-950 bg-navy-950 text-white"
                  : "border-border bg-surface text-muted hover:border-accent/50")
              }
            >
              {CONTACT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-caption font-medium uppercase tracking-wide text-subtle">Dahili notlar</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Bu başvuruyla ilgili notlarınız (yalnızca panelde görünür)…"
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-small text-foreground outline-none transition-colors focus:border-accent"
        />
        <button
          type="button"
          onClick={saveNotes}
          disabled={pending || notes === savedNotes}
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {noteSaved ? <Check className="size-4" /> : <Save className="size-4" />}
          {noteSaved ? "Kaydedildi" : "Notu kaydet"}
        </button>
      </div>

      <div className="border-t border-border pt-5">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-small text-foreground">Bu mesaj kalıcı olarak silinsin mi?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-lg bg-[#8a2b2b] px-3 text-small font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Evet, sil
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-small font-medium text-foreground"
            >
              Vazgeç
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-small font-medium text-muted transition-colors hover:border-[#e0b4b4] hover:text-[#8a2b2b]"
          >
            <Trash2 className="size-4" /> Mesajı sil
          </button>
        )}
      </div>
    </div>
  );
}
