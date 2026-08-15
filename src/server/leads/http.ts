import "server-only";

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

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
};

const MAX_REDIRECTS = 4;
const MAX_BYTES = 2_000_000; // 2 MB is far more than any page we parse needs

export async function httpGetText(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; maxBytes?: number } = {},
): Promise<HttpTextResult> {
  return get(url, opts, 0);
}

function get(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; maxBytes?: number },
  redirects: number,
): Promise<HttpTextResult> {
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
          "user-agent": "AYZENITH-LeadFinder/1.0 (+https://www.ayzenith.com)",
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
        res.on("aborted", () => {
          // Truncated by us or by the peer — keep whatever we already have.
          done(() => resolve({ status, text: clean(Buffer.concat(chunks)), finalUrl: target.toString() }));
        });
        res.on("error", (e: Error) => done(() => reject(e)));
        res.on("end", () => {
          done(() => resolve({ status, text: clean(Buffer.concat(chunks)), finalUrl: target.toString() }));
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

/**
 * Decode a response body and strip NUL bytes.
 *
 * Postgres cannot store \u0000 in a text or jsonb value — it rejects the whole
 * statement with "unsupported Unicode escape sequence". Real pages do contain
 * them (a padded binary blob, a truncated multi-byte sequence), and because the
 * raw HTML is cached as JSON, one such page was enough to make an insert fail
 * mid-run. Dropping the byte costs nothing: it carries no meaning in markup we
 * only ever read as text.
 */
function clean(buf: Buffer): string {
  return buf.toString("utf8").replace(/\u0000/g, "");
}
