"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { logActivity } from "./activity";

/** Sign out: clear the session cookie, audit it, and return to the login page. */
export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await clearSessionCookie();
  if (user) {
    await logActivity({
      userId: user.id,
      action: "user.logout",
      summary: "Çıkış yapıldı",
    });
  }
  redirect("/admin/login");
}
