/**
 * The private-network guard for operator-pasted URLs.
 *
 * Two screens hand the SERVER an address a person typed — Import Intelligence's
 * manufacturer pages and Product Intelligence's competitor pages. Until this
 * guard was shared, only the second one checked anything, so Import
 * Intelligence would fetch its own private network on request and show the
 * answer. These tests pin both the obvious cases and the encodings that exist
 * specifically to walk past a naive string check.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkFetchableUrl } from "../src/lib/safe-url";

const ok = (u: string) => checkFetchableUrl(u).ok;
const reason = (u: string) => {
  const r = checkFetchableUrl(u);
  return r.ok ? null : r.reason;
};

test("safe-url: ordinary public addresses are allowed", () => {
  assert.equal(ok("https://www.trendyol.com/urun-123"), true);
  assert.equal(ok("http://example.com/datasheet.pdf"), true);
  assert.equal(ok("https://sub.domain.co.uk:8443/path?q=1"), true);
  assert.equal(ok("https://8.8.8.8/"), true, "a public IP literal is still public");
});

test("safe-url: only http and https", () => {
  for (const u of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com", "data:text/html,hi"]) {
    assert.equal(ok(u), false, `${u} must be refused`);
  }
  assert.match(reason("file:///etc/passwd") ?? "", /http ve https/);
});

test("safe-url: loopback and localhost in every spelling", () => {
  for (const u of [
    "http://localhost/",
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://app.localhost/",
  ]) {
    assert.equal(ok(u), false, `${u} must be refused`);
  }
});

test("safe-url: the private ranges", () => {
  for (const u of [
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://172.31.255.254/",
    "http://100.64.0.1/",
  ]) {
    assert.equal(ok(u), false, `${u} must be refused`);
  }
  // 172.32 is NOT private — the guard must not over-block.
  assert.equal(ok("http://172.32.0.1/"), true);
  assert.equal(ok("http://11.0.0.1/"), true);
});

test("safe-url: cloud metadata link-local is refused", () => {
  assert.equal(ok("http://169.254.169.254/latest/meta-data/"), false);
  assert.equal(ok("http://169.254.170.2/v2/credentials"), false);
});

test("safe-url: integer, octal and hex spellings of 127.0.0.1 are still 127.0.0.1", () => {
  // These all resolve to loopback and all pass a naive /^127\./ check.
  assert.equal(ok("http://2130706433/"), false, "decimal form");
  assert.equal(ok("http://0x7f000001/"), false, "hex form");
  assert.equal(ok("http://017700000001/"), false, "octal form");
  assert.equal(ok("http://0x7f.0.0.1/"), false, "mixed hex octet");
  assert.equal(ok("http://127.0.0.01/"), false, "octal octet");
});

test("safe-url: IPv6 loopback, unique-local, link-local and IPv4-mapped", () => {
  for (const u of ["http://[::1]/", "http://[::]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/"]) {
    assert.equal(ok(u), false, `${u} must be refused`);
  }
  assert.equal(ok("http://[2606:4700:4700::1111]/"), true, "a public IPv6 is allowed");
});

test("safe-url: an IPv4-mapped address is refused in BOTH spellings", () => {
  // `new URL()` rewrites "::ffff:127.0.0.1" as "::ffff:7f00:1", so a guard that
  // only knows the dotted spelling never sees the address it is meant to block.
  assert.equal(new URL("http://[::ffff:127.0.0.1]/").hostname, "[::ffff:7f00:1]");
  assert.equal(ok("http://[::ffff:127.0.0.1]/"), false, "dotted, as typed");
  assert.equal(ok("http://[::ffff:7f00:1]/"), false, "hex, as parsed");
  assert.equal(ok("http://[::ffff:10.0.0.1]/"), false, "private range, mapped");
  assert.equal(ok("http://[::ffff:a9fe:a9fe]/"), false, "169.254.169.254, mapped");
  assert.equal(ok("http://[::ffff:8.8.8.8]/"), true, "a mapped PUBLIC address is fine");
});

test("safe-url: internal-looking names are refused", () => {
  for (const u of ["http://db.internal/", "http://printer.local/", "http://router.home.arpa/"]) {
    assert.equal(ok(u), false, `${u} must be refused`);
  }
});

test("safe-url: credentials in the URL are refused", () => {
  // A classic way to make a hostile host look like a familiar one.
  assert.equal(ok("http://www.trendyol.com@169.254.169.254/"), false);
  assert.match(reason("http://user:pass@example.com/") ?? "", /şifre/);
});

test("safe-url: junk input is refused rather than thrown", () => {
  for (const u of ["", "   ", "not a url", "http://", "///x"]) {
    assert.equal(ok(u), false, `${JSON.stringify(u)} must be refused`);
  }
});

test("safe-url: whitespace around a good address is tolerated", () => {
  const r = checkFetchableUrl("  https://example.com/x  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.url.hostname, "example.com");
});
