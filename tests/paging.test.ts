/**
 * Page numbers arriving from a URL.
 *
 * Seven list screens read `?page=` with `Number(x) || 1` and hand the result to
 * a repository. The repositories clamped the LOWER bound but not the upper one,
 * so `?page=1e99` produced a skip Postgres cannot hold:
 *
 *   PrismaClientUnknownRequestError: Unable to fit value 2.5e+100 into a
 *   64-bit signed integer for field `skip`
 *
 * — a 500 on an ordinary list, from nothing but a hand-edited URL. A fractional
 * page produced a fractional skip by the same route. These pin both ends.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { pageSkip, safePage, safePerPage } from "../src/lib/paging";

test("paging: ordinary pages are untouched", () => {
  assert.equal(safePage(1), 1);
  assert.equal(safePage(7), 7);
  assert.equal(safePage("3"), 3);
});

test("paging: a missing or unreadable page is page one", () => {
  assert.equal(safePage(undefined), 1);
  assert.equal(safePage(null), 1);
  assert.equal(safePage(""), 1);
  assert.equal(safePage("abc"), 1);
  assert.equal(safePage(NaN), 1);
});

test("paging: a negative page can never become a negative skip", () => {
  assert.equal(safePage(-5), 1);
  assert.equal(safePage("-1"), 1);
  assert.equal(safePage(0), 1);
  assert.ok(pageSkip(-5, 25) >= 0);
  assert.equal(pageSkip(-5, 25), 0);
});

test("paging: an enormous page is capped instead of overflowing the query", () => {
  // The exact shape that produced "Unable to fit value 2.5e+100 into a 64-bit
  // signed integer": 1e99 survived `Math.max(1, …)` because it is positive.
  assert.equal(Math.max(1, 1e99), 1e99, "the old clamp let this straight through");
  const skip = pageSkip(1e99, 25);
  assert.ok(Number.isSafeInteger(skip), `skip must stay a safe integer, got ${skip}`);
  assert.ok(skip <= Number.MAX_SAFE_INTEGER);
  assert.equal(safePage(Infinity), 1, "Infinity is not a page");
});

test("paging: a fractional page yields a whole skip", () => {
  assert.equal(safePage(2.7), 2);
  assert.equal(pageSkip(2.7, 25), 25);
  assert.ok(Number.isInteger(pageSkip(2.7, 25)));
});

test("paging: page size stays inside sane bounds", () => {
  assert.equal(safePerPage(undefined, 25), 25);
  assert.equal(safePerPage(0, 25), 25);
  assert.equal(safePerPage(-10, 25), 25);
  assert.equal(safePerPage("abc", 25), 25);
  assert.equal(safePerPage(1e9, 25), 500, "one URL must not ask for the whole table");
  assert.equal(safePerPage(50, 25), 50);
});

test("paging: skip is always a non-negative whole number for any input", () => {
  for (const p of [-1e99, -1, 0, 1, 2.5, 1e6, 1e99, NaN, Infinity, -Infinity, "x", null, undefined]) {
    const skip = pageSkip(p as unknown, 25);
    assert.ok(Number.isInteger(skip) && skip >= 0, `pageSkip(${String(p)}) = ${skip}`);
  }
});
