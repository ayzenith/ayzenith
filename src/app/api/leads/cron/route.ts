import { NextResponse } from "next/server";
import { verifyPendingAcrossSearches } from "@/server/leads/reverify";

/**
 * AYZENITH LEAD FINDER — deferred verification (cron entry point).
 *
 * A discovery run can only read so many websites before it hits its request
 * budget, so a large search always ends with most firms never checked. This job
 * works through that backlog in bounded batches, newest searches first, so
 * coverage keeps climbing without any single request running long.
 *
 * Protected by the same shared secret RADAR's cron uses: Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`, and with no secret configured the
 * endpoint refuses to run so it cannot be triggered anonymously in production.
 *
 * Scheduled in vercel.json.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET tanımlı değil; otomatik doğrulama kapalı." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const results = await verifyPendingAcrossSearches();
  const attempted = results.reduce((s, r) => s + r.attempted, 0);
  const reachable = results.reduce((s, r) => s + r.reachable, 0);
  const remaining = results.reduce((s, r) => s + r.remaining, 0);

  return NextResponse.json({ ok: true, searches: results.length, attempted, reachable, remaining });
}
