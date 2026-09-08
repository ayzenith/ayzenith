/**
 * AYZENITH LEAD FINDER — telling "this site refused US" from "this site is gone".
 *
 * WHY THIS FILE EXISTS
 *
 * A read-only probe of ten firms the crawler had written off as UNREACHABLE
 * found that only five were actually dead. Three answered 200 the instant the
 * request carried a browser's user-agent instead of ours (Ulla Popken, two
 * METRO branches) and two sat behind a WAF that turns away every non-browser
 * client (Cloudflare, Akamai). Recording all ten as "site down" discarded live
 * leads and told the operator something untrue about the other five.
 *
 * The distinction is worth a module of its own because it is a JUDGEMENT — which
 * status codes and which body markers mean "you are the problem" rather than
 * "the URL is the problem" — and judgements belong somewhere they can be tested.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

/** How a site refused us, when it refused us as a CLIENT rather than as a URL. */
export type BlockKind = "BOT_REFUSED" | "WAF_CHALLENGE" | "RATE_LIMITED";

/** Body markers that mean "a WAF is challenging us", not "here is the page". */
const CHALLENGE_MARKERS = [
  "cf-browser-verification",
  "checking your browser",
  "cdn-cgi/challenge",
  "just a moment...",
  "/recaptcha/",
  "incapsula incident id",
  "access denied",
  "request unsuccessful",
];

/**
 * Classify a response as a client-refusal, or null when it is an ordinary HTTP
 * outcome that says something about the URL (200, 404, 500 …).
 *
 * 401/403 are the bot rules; 429 is a rate limit, which is a refusal but a
 * different KIND — see `retryableAsBrowser`. A challenge page can also arrive
 * dressed as 503 or Cloudflare's 520, so those count only when the body says so.
 */
export function classifyBlock(status: number, body: string): BlockKind | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429) return "RATE_LIMITED";

  const hay = body.slice(0, 8_000).toLowerCase();
  const challenged = CHALLENGE_MARKERS.some((m) => hay.includes(m));

  if (status === 403 || status === 401) return challenged ? "WAF_CHALLENGE" : "BOT_REFUSED";
  if ((status === 503 || status === 520) && challenged) return "WAF_CHALLENGE";
  return null;
}

/**
 * Is this a refusal a different client identity could plausibly change?
 *
 * A 429 is NOT: it means we asked too often, and asking again under another
 * name is precisely the wrong response — it would turn a politeness signal into
 * a reason to press harder. Only identity-based refusals earn the one retry.
 */
export function retryableAsBrowser(kind: BlockKind | null): boolean {
  return kind === "BOT_REFUSED" || kind === "WAF_CHALLENGE";
}
