import "server-only";

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

import { classifyBlock, retryableAsBrowser, type BlockKind } from "./blocking";

export { classifyBlock, retryableAsBrowser, type BlockKind } from "./blocking";

/**
 * AYZENITH LEAD FINDER — hardened HTTP GET for third-party websites (§V3.4).
 *
 * WHY THIS EXISTS. Website verification crawls arbitrary company sites, and some
 * of them answer with malformed HTTP framing. Node's built-in `fetch` (undici)
 * reacts to that by throwing an AssertionError from its parser on the socket's
 * end event — OUTSIDE any promise, so `try/catch` around the await cannot catch
 * it and the whole process dies. A real German lead, andrews-martin.de,
 * reproduced this every single time: one bad server was enough to kill an entire
 * verification run, and would have done the same in production.
 *
 * `node:https` surfaces the same condition as a catchable "error" EVENT, so a
 * hostile or broken server can only fail its own request. That is the entire
 * point of this module; it is not a performance or feature change.
 *
 * It deliberately keeps the parts of fetch's behaviour the crawler relied on:
 * redirects are followed (bounded), non-2xx is an error, and the body is read as
 * text — plus a byte cap fetch never had, so a huge page cannot exhaust memory.
 * Compression is declined (`accept-encoding: identity`) because node:https does
 * not decompress on its own; slightly more bandwidth for markedly less to break.
 */

export type HttpTextResult = {
  status: number;
  text: string;
  /** URL the response actually came from, after any redirects. */
  finalUrl: string;
  /** Set when the response is a refusal aimed at automated clients rather than
   *  an answer about the site. Null on any normal response, 2xx or not. */
  blockKind: BlockKind | null;
  /** True when the browser-identity retry below was what produced this result. */
  usedBrowserIdentity: boolean;
};

/**
 * How a site refused us, when it refused us as a CLIENT rather than as a URL.
 *
 * Kept apart from "unreachable" on purpose. A live audit of ten firms marked
 * UNREACHABLE found only five actually dead: three answered 200 the moment the
 * request looked like a browser (Ulla Popken, two METRO branches) and two were
 * behind a WAF that refuses everything (Cloudflare, Akamai). Recording all ten
 * as "site down" threw away real leads and told the operator something false.
 */
/** Honest identity, used for every request we make first. */
export const BOT_UA = "AYZENITH-LeadFinder/1.0 (+https://www.ayzenith.com)";

/**
 * Fallback identity for the ONE retry an identity-based refusal buys.
 *
 * Not a disguise for its own sake: these are public marketing pages any person
 * may open in a browser, and the CDN rule that turned us away keys on the bot
 * identity rather than on anything about the request. We ask honestly first,
 * every time, and only repeat the same question the way a normal visitor would
 * ask it. Nothing else changes — same rate, same redirect budget, same byte cap.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * The retry sends a browser's whole header SET, not just its user-agent.
 *
 * Swapping the UA alone did not work, and the reason is worth recording: our
 * honest requests declare `accept-encoding: identity` (see below — node:https
 * does not decompress), and no real browser has ever asked for that. Akamai and
 * Cloudflare fingerprint the header set as a whole, so a Chrome UA arriving with
 * an impossible Accept-Encoding reads as a crawler pretending to be Chrome —
 * which is a stronger bot signal than the honest bot UA was. Two METRO branches
 * and ullapopken.de answered 200 to a browser and kept refusing the UA-only
 * retry until the rest of these headers came with it.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "upgrade-insecure-requests": "1",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
};

/** Error thrown for a non-2xx response, carrying enough to tell "dead" from
 *  "blocked" further up. */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly blockKind: BlockKind | null,
  ) {
    super(`HTTP ${status} — ${url}${blockKind ? ` (${blockKind})` : ""}`);
    this.name = "HttpStatusError";
  }
}

const MAX_REDIRECTS = 4;
const MAX_BYTES = 2_000_000; // 2 MB is far more than any page we parse needs

export async function httpGetText(
  url: string,
  opts: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    maxBytes?: number;
    /** Opt OUT of the browser-identity retry (default: on). */
    retryAsBrowser?: boolean;
  } = {},
): Promise<HttpTextResult> {
  const first = await get(url, opts, 0);
  const kind = first.status >= 200 && first.status < 300 ? null : classifyBlock(first.status, first.text);

  // Ask honestly, once. If the refusal was aimed at the client rather than the
  // URL, ask the same question the way a browser would — exactly one more time.
  const callerSetUa = Object.keys(opts.headers ?? {}).some((h) => h.toLowerCase() === "user-agent");
  if ((opts.retryAsBrowser ?? true) && !callerSetUa && retryableAsBrowser(kind)) {
    const retry = await get(url, { ...opts, headers: { ...opts.headers, ...BROWSER_HEADERS } }, 0);
    if (retry.status >= 200 && retry.status < 300) {
      return { ...retry, blockKind: null, usedBrowserIdentity: true };
    }
    return {
      ...retry,
      blockKind: classifyBlock(retry.status, retry.text) ?? kind,
      usedBrowserIdentity: true,
    };
  }

  return { ...first, blockKind: kind, usedBrowserIdentity: false };
}

type RawResult = { status: number; text: string; finalUrl: string };

function get(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; maxBytes?: number },
  redirects: number,
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new Error(`Geçersiz URL: ${url}`));
      return;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      reject(new Error(`Desteklenmeyen protokol: ${target.protocol}`));
      return;
    }

    const timeoutMs = opts.timeoutMs ?? 12_000;
    const maxBytes = opts.maxBytes ?? MAX_BYTES;
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;

    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req = send(
      target,
      {
        method: "GET",
        headers: {
          "user-agent": BOT_UA,
          accept: "text/html,application/xhtml+xml",
          // node:https will NOT decompress for us, so ask for plain bytes.
          "accept-encoding": "identity",
          ...opts.headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        // Redirects — fetch followed them, so we must too or half the sites
        // (http→https, apex→www) would look unreachable.
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume(); // drain, we are not reading this body
          if (redirects >= MAX_REDIRECTS) {
            done(() => reject(new Error(`Çok fazla yönlendirme: ${url}`)));
            return;
          }
          let next: string;
          try {
            next = new URL(location, target).toString();
          } catch {
            done(() => reject(new Error(`Geçersiz yönlendirme hedefi: ${location}`)));
            return;
          }
          done(() => {
            get(next, opts, redirects + 1).then(resolve, reject);
          });
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            // Enough to parse; stop pulling rather than buffer without bound.
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const contentType = Array.isArray(res.headers["content-type"])
          ? res.headers["content-type"][0]
          : res.headers["content-type"];
        const contentEncoding = (Array.isArray(res.headers["content-encoding"])
          ? res.headers["content-encoding"][0]
          : res.headers["content-encoding"])?.toLowerCase();
        res.on("aborted", () => {
          // Truncated by us or by the peer — keep whatever we already have.
          done(() =>
            resolve({ status, text: clean(Buffer.concat(chunks), contentType, contentEncoding), finalUrl: target.toString() }),
          );
        });
        res.on("error", (e: Error) => done(() => reject(e)));
        res.on("end", () => {
          done(() =>
            resolve({ status, text: clean(Buffer.concat(chunks), contentType, contentEncoding), finalUrl: target.toString() }),
          );
        });
      },
    );

    // THE point of this module: a malformed response arrives here as an event we
    // can handle, instead of as an assertion that takes the process down.
    req.on("error", (e: Error) => done(() => reject(e)));
    req.on("timeout", () => {
      req.destroy();
      done(() => reject(new Error(`Zaman aşımı (${timeoutMs}ms): ${url}`)));
    });

    req.end();
  });
}

/** Charset labels this crawler is willing to trust and actually sees in the
 *  wild (2026-08-23 audit of cached leads: 32 pages declared iso-8859-1, all
 *  real German Impressum/Kontakt pages, 22 of them decoded into mojibake
 *  because the whole response was force-read as UTF-8 regardless). Anything
 *  else falls back to utf-8 — the overwhelming majority of the modern web. */
const KNOWN_CHARSETS = new Set([
  "utf-8", "utf8",
  "iso-8859-1", "latin1",
  "windows-1252", "cp1252",
  "iso-8859-15",
]);

/** Pull `charset=...` out of a Content-Type header, if present. */
function charsetFromHeader(contentType: string | undefined): string | null {
  const m = contentType?.match(/charset\s*=\s*"?([\w-]+)"?/i);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Pull `<meta charset="...">` or the equiv `<meta http-equiv="Content-Type"
 *  content="...;charset=...">` out of the page itself. Charset DECLARATIONS are
 *  always plain ASCII by spec, so scanning the first bytes as latin1 (a lossless
 *  1-byte-per-char decode) to find them is always safe, even before we know the
 *  real encoding of the rest of the page. */
function charsetFromMeta(buf: Buffer): string | null {
  const head = buf.subarray(0, Math.min(buf.length, 2048)).toString("latin1");
  const m1 = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
  if (m1?.[1]) return m1[1].toLowerCase();
  const m2 = head.match(
    /<meta[^>]+http-equiv\s*=\s*["']content-type["'][^>]*content\s*=\s*["'][^"']*charset=([\w-]+)/i,
  );
  return m2?.[1]?.toLowerCase() ?? null;
}

/**
 * Decode a response body using its DECLARED charset (HTTP header first, then
 * the page's own <meta> tag, defaulting to UTF-8) and strip NUL bytes.
 *
 * WHY THIS EXISTS (2026-08-23). This crawler previously always decoded the raw
 * bytes as UTF-8. Real German company sites — Impressum/Kontakt pages, exactly
 * the pages this module reads for legal name, VAT id and decision-maker names —
 * still serve charset=iso-8859-1; every non-ASCII byte in a name like "Müller"
 * or "Geschäftsführer" is invalid UTF-8 and was silently replaced with the
 * U+FFFD replacement character. A live audit of the production cache found 32
 * such pages, 22 already visibly corrupted. A page that reads as garbage looks
 * EXACTLY like a page with no product/role evidence on it, which is worse than
 * it sounds: the V3.10 relevance ranking treats "we read the site and found
 * nothing" as WORSE than "we never looked" (an unread lead can still be a real
 * prospect; a read-and-empty one is demoted). This bug was quietly pushing a
 * small number of genuine German leads to the bottom of the list.
 *
 * Postgres cannot store the NUL character in a text or jsonb value — it
 * rejects the whole statement with "unsupported Unicode escape sequence". Real
 * pages do contain one (a padded binary blob, a truncated multi-byte sequence),
 * and because the raw HTML is cached as JSON, one such page was enough to make
 * an insert fail mid-run. Dropping the byte costs nothing: it carries no
 * meaning in markup we only ever read as text.
 */
/**
 * Undo a Content-Encoding, if one was applied.
 *
 * Only the browser-identity retry asks for compression (a plain crawl still says
 * `identity`), but once we ask we must be able to read the answer. A body we
 * cannot decompress is returned as-is rather than thrown away: for a blocked or
 * error response the caller only needs enough bytes to classify it, and a
 * partial read beats no read.
 */
function decompress(buf: Buffer, encoding?: string): Buffer {
  if (!encoding || encoding === "identity" || buf.length === 0) return buf;
  try {
    if (encoding === "gzip" || encoding === "x-gzip") return gunzipSync(buf);
    if (encoding === "deflate") return inflateSync(buf);
    if (encoding === "br") return brotliDecompressSync(buf);
  } catch {
    // Truncated by our own byte cap, or simply mislabelled by the server.
  }
  return buf;
}

function clean(rawBuf: Buffer, contentTypeHeader?: string, contentEncoding?: string): string {
  const buf = decompress(rawBuf, contentEncoding);
  const declared = charsetFromHeader(contentTypeHeader) ?? charsetFromMeta(buf) ?? "utf-8";
  const charset = KNOWN_CHARSETS.has(declared) ? declared : "utf-8";
  let text: string;
  if (charset === "utf-8" || charset === "utf8") {
    text = buf.toString("utf8");
  } else {
    try {
      text = new TextDecoder(charset).decode(buf);
    } catch {
      text = buf.toString("utf8");
    }
  }
  return text.replace(/\0/g, "");
}
