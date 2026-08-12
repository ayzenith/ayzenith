import { NextResponse } from "next/server";
import { refreshAllWatches } from "@/server/radar/watch";

/**
 * AYZENITH RADAR — weekly watch refresh (cron entry point).
 *
 * Re-runs every active watch, producing a fresh immutable snapshot and comparing
 * it to the previous one so change alerts appear on the dashboard. Protected by a
 * shared secret: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without
 * a configured secret the endpoint refuses to run (so it can't be triggered
 * anonymously in production).
 *
 * Schedule it in vercel.json, e.g. weekly:
 *   { "crons": [{ "path": "/api/radar/cron", "schedule": "0 6 * * 1" }] }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET tanımlı değil; otomatik yenileme kapalı." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const results = await refreshAllWatches();
  const alerts = results.filter((r) => r.alert).length;
  return NextResponse.json({ ok: true, refreshed: results.length, alerts });
}
