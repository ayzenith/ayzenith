"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

/**
 * Login form. Uses React 19 `useActionState` for progressive-enhancement-friendly
 * server-action submission and `useFormStatus` for the pending state.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy-950 px-5 text-small font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Giriş yapılıyor…
        </>
      ) : (
        "Giriş yap"
      )}
    </button>
  );
}

export function LoginForm({ from }: { from?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {from ? <input type="hidden" name="from" value={from} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[#e0b4b4] bg-[#fbeaea] px-4 py-3 text-small text-[#8a2b2b]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-small font-medium text-foreground">E-posta</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-lg border border-border bg-surface px-3.5 text-small text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-small font-medium text-foreground">Şifre</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border border-border bg-surface px-3.5 text-small text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </label>

      <SubmitButton />
    </form>
  );
}
