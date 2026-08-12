"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, UserPlus, Wand2, X } from "lucide-react";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { createUserAction, type CreateUserState } from "@/app/(admin)/admin/(dashboard)/users/actions";

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-small text-foreground outline-none transition-colors focus:border-accent";

function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

/** Create-user panel. Collapsed by default; expands to a small inline form. */
export function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CreateUserState, FormData>(
    createUserAction,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPassword("");
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setPassword(randomPassword());
          setOpen(true);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
      >
        <UserPlus className="size-4" aria-hidden="true" /> Kullanıcı ekle
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h6 font-semibold text-foreground">Yeni kullanıcı</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-foreground"
          aria-label="Kapat"
        >
          <X className="size-4" />
        </button>
      </div>

      {state.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">Ad soyad</span>
          <input name="name" className={inputCls} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">E-posta</span>
          <input name="email" type="email" className={inputCls} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">Rol</span>
          <select name="role" defaultValue="EDITOR" className={inputCls}>
            <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
            <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">Geçici şifre</span>
          <div className="flex gap-2">
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setPassword(randomPassword())}
              title="Yeni şifre üret"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:border-accent/50 hover:text-foreground"
            >
              <Wand2 className="size-4" />
            </button>
          </div>
        </label>
      </div>

      <p className="mt-3 text-caption text-subtle">
        Bu şifreyi kullanıcıya iletin; ilk girişte kullanır. (Kayıt yoktur — kullanıcıları yalnızca siz eklersiniz.)
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-small font-medium text-foreground"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-5 text-small font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Kullanıcıyı ekle
        </button>
      </div>
    </form>
  );
}
