/**
 * Is this address one the SERVER may be told to fetch? (pure, no I/O)
 *
 * WHY THIS EXISTS
 *
 * Two screens let an operator paste a URL that the server then reads: Import
 * Intelligence's manufacturer/datasheet pages and Product Intelligence's
 * competitor pages. A server that fetches whatever it is handed can be pointed
 * back at the private network it is sitting in — cloud metadata endpoints,
 * internal services, the database's own host — and the response is then shown
 * on screen or stored. That is server-side request forgery, and the operator
 * does not have to be hostile for it to happen; a pasted link is enough.
 *
 * Deliberately pure and shared: this check was written once for Product
 * Intelligence and NOT applied to Import Intelligence, which is exactly how a
 * guard becomes decorative. One function, one meaning, one place to fix.
 *
 * WHAT IT DOES NOT DO. It cannot stop DNS rebinding: a public name that
 * resolves to 127.0.0.1 passes here, because nothing is resolved at this point.
 * Closing that needs the resolved address to be checked at connect time, which
 * is a different (and much larger) change. This blocks the literal and encoded
 * addresses, which is what a pasted link realistically carries.
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * IPv4 written as one number ("http://2130706433/" is 127.0.0.1), as octal, or
 * as hex — all of which browsers and `fetch` accept and a naive string check
 * misses entirely.
 */
function asIpv4(host: string): string | null {
  // Dotted quad, possibly with octal/hex parts.
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((p) => p !== "" && /^(0x[0-9a-f]+|0[0-7]*|\d+)$/i.test(p))) {
    const nums = parts.map((p) => (/^0x/i.test(p) ? parseInt(p, 16) : /^0[0-7]+$/.test(p) ? parseInt(p, 8) : Number(p)));
    if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return nums.join(".");
    return null;
  }
  // A single integer, octal or hex form of the whole address.
  if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)) {
    const n = /^0x/i.test(host) ? parseInt(host, 16) : /^0[0-7]+$/.test(host) ? parseInt(host, 8) : Number(host);
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  return null;
}

function isPrivateIpv4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = o as [number, number, number, number];
  if (a === 0 || a === 127) return true; // this host / loopback
  if (a === 10) return true; // private
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped addresses re-enter the IPv4 rules. Both spellings matter: a
  // person types "::ffff:127.0.0.1", but `new URL()` normalises it to the hex
  // group form "::ffff:7f00:1" — so checking only the dotted one would let the
  // parsed value straight through, which is exactly what it did.
  const dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && dotted[1]) return isPrivateIpv4(dotted[1]);
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex && hex[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateIpv4([(hi >>> 8) & 255, hi & 255, (lo >>> 8) & 255, lo & 255].join("."));
  }

  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // link-local fe80::/10
  return false;
}

/** Hostnames that are local by name rather than by address. */
const LOCAL_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

export function checkFetchableUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "Geçerli bir adres değil." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Yalnızca http ve https adresleri okunur." };
  }
  // Credentials in a URL are never needed here and are a common way to make a
  // hostile address look like a familiar one.
  if (url.username || url.password) {
    return { ok: false, reason: "Kullanıcı adı/şifre içeren adresler okunmaz." };
  }

  const host = url.hostname.toLowerCase();
  if (host === "" ) return { ok: false, reason: "Adreste alan adı yok." };
  if (host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Yerel veya özel ağ adresleri okunamaz." };
  }
  if (host.startsWith("[") || host.includes(":")) {
    if (isPrivateIpv6(host)) return { ok: false, reason: "Yerel veya özel ağ adresleri okunamaz." };
    return { ok: true, url };
  }

  const ipv4 = asIpv4(host);
  if (ipv4 && isPrivateIpv4(ipv4)) {
    return { ok: false, reason: "Yerel veya özel ağ adresleri okunamaz." };
  }

  return { ok: true, url };
}
