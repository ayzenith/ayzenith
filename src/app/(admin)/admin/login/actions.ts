"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate } from "@/server/auth";
import { createSessionCookie } from "@/lib/auth/session-cookie";
import { formatRetryAfter } from "@/lib/auth/throttle-policy";
import { clearEmailAttempts, discardAttempt, pruneThrottleRows, registerAttempt, throttleContext } from "@/server/login-throttle";
import { recordLogin } from "@/server/users";
import { logActivity } from "@/server/activity";

/**
 * Login server action. On success it sets the session cookie and redirects into
 * the CMS; on failure it returns a generic error (never leaking whether the
 * email exists). Consumed by the client form via `useActionState`.
 */

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  from: z.string().optional(),
});

export type LoginState = { error?: string };

// Only allow same-app redirect targets — never an attacker-supplied absolute URL.
// Both surfaces behind this one login are allowed: the CMS (/admin) and Business
// OS (/os). A leading "//" would be protocol-relative and leave the site, so the
// prefix check alone is not enough.
function safeDestination(from: string | undefined): string {
  if (!from || from.startsWith("//")) return "/admin";
  const allowed =
    (from === "/admin" || from.startsWith("/admin/")) && !from.startsWith("/admin/login")
      ? from
      : from === "/os" || from.startsWith("/os/")
        ? from
        : null;
  return allowed ?? "/admin";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    from: formData.get("from") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Geçerli bir e-posta ve şifre girin." };
  }

  // Throttling comes BEFORE authenticate() for two reasons: a blocked attempt
  // must not be able to succeed, and it must not buy an attacker the bcrypt
  // work either. The attempt is recorded inside `registerAttempt`, so every
  // request in flight is already counted in the number the others see.
  let ctx;
  let decision;
  try {
    // `throttleContext` derives the HMAC key and therefore needs AUTH_SECRET;
    // it belongs inside the same guard as the write, so a misconfiguration
    // shows the login form's own error instead of crashing the action.
    ctx = throttleContext(parsed.data.email, await headers());
    decision = await registerAttempt(ctx);
  } catch {
    // The counter could not be written. Refuse rather than wave it through —
    // a database that cannot take this row could not have signed anyone in.
    return { error: "Giriş şu anda yapılamıyor. Lütfen birazdan tekrar deneyin." };
  }

  if (!decision.allowed) {
    await logActivity({
      userId: null,
      action: "auth.throttle.blocked",
      entity: "LoginThrottle",
      entityId: decision.scope === "email" ? ctx.emailKey : (ctx.ipKey ?? undefined),
      summary: `Çok fazla başarısız giriş (${decision.scope === "email" ? "e-posta" : "IP"}); geçici olarak engellendi`,
    });
    return {
      error: `Çok fazla başarısız giriş denemesi. Lütfen ${formatRetryAfter(decision.retryAfterMs)} sonra tekrar deneyin.`,
    };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    // Unchanged and deliberately generic: a wrong password, an unknown address
    // and a disabled account must be indistinguishable from out here.
    return { error: "E-posta veya şifre hatalı ya da hesabınız devre dışı." };
  }

  // The sign-in worked, so this attempt was not a failure: take its
  // reservation back (otherwise successes would spend the address budget) and
  // clear whatever failures preceded it for this email.
  await discardAttempt(decision.attemptIds);
  await clearEmailAttempts(ctx);
  void pruneThrottleRows();

  await createSessionCookie({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await recordLogin(user.id);
  await logActivity({ userId: user.id, action: "user.login", summary: "Giriş yapıldı" });

  // redirect() throws NEXT_REDIRECT — must be outside any try/catch.
  redirect(safeDestination(parsed.data.from));
}
