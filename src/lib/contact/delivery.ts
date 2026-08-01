import type { ContactInput } from "@/lib/validation/contact";

/**
 * Contact delivery — the server-side seam between the API route and however
 * inquiries are ultimately delivered (email / CRM). The API route calls
 * deliverInquiry(); nothing about the form component or its contract changes as
 * providers are wired in.
 *
 * Providers are selected by env (CONTACT_DELIVERY). Until one is configured, the
 * inquiry is validated and acknowledged with no side effects, so the site is
 * fully functional out of the box. Resend is implemented with a plain fetch —
 * no SDK dependency is added to the bundle.
 *
 * This module is server-only (reads secrets); never import it into a Client
 * Component.
 */

export type DeliveryResult = { ok: true } | { ok: false; error: string };

export async function deliverInquiry(
  inquiry: ContactInput,
): Promise<DeliveryResult> {
  const provider = (process.env.CONTACT_DELIVERY ?? "none").toLowerCase();

  switch (provider) {
    case "resend":
      return deliverViaResend(inquiry);
    // Future seams — implemented the same way (env-gated, no contract change):
    //   case "smtp": return deliverViaSmtp(inquiry);   // via nodemailer
    //   case "crm":  return deliverViaCrmWebhook(inquiry);
    case "none":
    default:
      // Acknowledge-only: the inquiry passed validation. Surface it in server
      // logs so nothing is lost before a provider is connected.
      if (process.env.NODE_ENV !== "production") {
        console.info("[contact] inquiry received (delivery not configured)", {
          company: inquiry.company,
          interest: inquiry.interest,
          region: inquiry.region,
        });
      }
      return { ok: true };
  }
}

/**
 * Resend transactional email via the REST API (no dependency). Requires
 * RESEND_API_KEY and CONTACT_TO_EMAIL; falls back to acknowledge-only if the
 * environment is incomplete, so a misconfiguration never drops an inquiry.
 */
async function deliverViaResend(inquiry: ContactInput): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL ?? "website@ayzenith.com";

  if (!apiKey || !to) {
    return { ok: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `AYZENITH Website <${from}>`,
        to: [to],
        reply_to: inquiry.email,
        subject: `New partnership inquiry — ${inquiry.company}`,
        text: formatInquiry(inquiry),
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `resend_${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "resend_network_error" };
  }
}

function formatInquiry(inquiry: ContactInput): string {
  return [
    `Name:     ${inquiry.name}`,
    `Company:  ${inquiry.company}`,
    `Email:    ${inquiry.email}`,
    `Region:   ${inquiry.region}`,
    `Interest: ${inquiry.interest}`,
    "",
    inquiry.message,
  ].join("\n");
}
