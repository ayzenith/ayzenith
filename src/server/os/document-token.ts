import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived, document-scoped tokens for the PDF pipeline.
 *
 * The live preview iframe is loaded by the signed-in user's own browser (their
 * session cookie already authorizes it). The PDF route, however, launches a
 * headless Chromium that makes its OWN request to /doc/[id]/print — it has no
 * browser cookie to forward. Rather than proxy cookies into Puppeteer, the PDF
 * route mints a token bound to exactly one document id with a 60-second TTL,
 * and Chromium carries that in the URL. A leaked/logged URL is worthless a
 * minute later and useless for any document but the one it was minted for —
 * this is what rule §35 ("no predictable PDF URLs, no cross-tenant access")
 * asks for without needing session-cookie plumbing across a process boundary.
 */

const TTL_SECONDS = 60;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short.");
  return new TextEncoder().encode(s);
}

export async function signDocumentToken(documentId: string): Promise<string> {
  return new SignJWT({ docId: documentId, purpose: "doc-render" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyDocumentToken(token: string | undefined | null, documentId: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "doc-render" && payload.docId === documentId;
  } catch {
    return false;
  }
}

/**
 * Generic version for the simple receipt printouts (payment/expense/tax —
 * see src/components/trade-docs/receipt-template.tsx). `resource` is a plain
 * scope string like "payment:cl123..." — same one-minute, one-purpose pattern
 * as the trade-document token above, just not tied to a TradeDocument row.
 */
export async function signResourceToken(resource: string): Promise<string> {
  return new SignJWT({ resource, purpose: "receipt-render" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyResourceToken(token: string | undefined | null, resource: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "receipt-render" && payload.resource === resource;
  } catch {
    return false;
  }
}
