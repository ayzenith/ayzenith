import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getOsAlerts } from "@/server/os/dashboard";

/**
 * AYZENITH BUSINESS OS — alert feed for the desktop app.
 *
 * The Electron panel polls this so it can raise a native Windows notification
 * ("2 gecikmiş tahsilat") without keeping the cockpit page open. It returns
 * exactly what the cockpit's "bugün dikkat etmen gerekenler" list shows, from
 * the same `buildAttention` — the tray must never disagree with the screen.
 *
 * `/api/*` is excluded from the middleware matcher, so this route authenticates
 * itself. It uses `getCurrentUser` rather than `requireUser` on purpose: a
 * fetch client needs a 401, not a redirect to an HTML login page.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Oturum yok." }, { status: 401 });
  }

  const { attention, counts } = await getOsAlerts();
  return NextResponse.json(
    { ok: true, attention, counts, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
