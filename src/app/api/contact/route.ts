import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation/contact";
import { deliverInquiry } from "@/lib/contact/delivery";

/**
 * POST /api/contact — receives, filters, validates and delivers inquiries.
 *
 * Defense in depth:
 *  1. Honeypot — a hidden field no human fills. If present, we return a benign
 *     success (never tipping off bots) and drop the submission silently.
 *  2. Zod re-validation server-side — the form cannot be bypassed by crafted
 *     requests (422 on failure).
 *  3. Delivery is delegated to the env-selected provider; a delivery failure
 *     returns 502 so the client shows its error state rather than a false
 *     success.
 *
 * Node.js runtime, always dynamic — excluded from the static page payload.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // 1 — Honeypot. Bots fill hidden fields; humans never see them.
  if (
    typeof payload === "object" &&
    payload !== null &&
    "hp" in payload &&
    typeof (payload as { hp: unknown }).hp === "string" &&
    (payload as { hp: string }).hp.trim() !== ""
  ) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 2 — Validate (unknown keys such as `hp` are stripped by the schema).
  const result = contactSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 422 });
  }

  // 3 — Deliver via the configured provider (acknowledge-only until wired).
  const delivery = await deliverInquiry(result.data);
  if (!delivery.ok) {
    return NextResponse.json({ ok: false, error: "delivery_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
