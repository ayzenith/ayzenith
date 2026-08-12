"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate } from "@/server/auth";
import { createSessionCookie } from "@/lib/auth/session-cookie";
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
function safeDestination(from: string | undefined): string {
  if (from && from.startsWith("/admin") && !from.startsWith("/admin/login")) {
    return from;
  }
  return "/admin";
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

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "E-posta veya şifre hatalı ya da hesabınız devre dışı." };
  }

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
