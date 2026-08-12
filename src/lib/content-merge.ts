/**
 * Pure helpers for the content-override system (client-safe, no imports).
 *
 * The public site's copy lives in next-intl catalogs (messages/*.json). The CMS
 * stores per-string OVERRIDES keyed by the message dot-path. At request time we
 * merge the overrides onto the base catalog so every `t()` call reflects edits
 * without touching a single component.
 */

export type Messages = Record<string, unknown>;

/** A flattened leaf string from a (possibly nested) message object. */
export type Leaf = { key: string; value: string };

/** Collect every string leaf as `{ "a.b.c": "text" }` (nested objects only). */
export function flattenMessages(obj: Messages, prefix = ""): Leaf[] {
  const out: Leaf[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out.push({ key, value: v });
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flattenMessages(v as Messages, key));
    }
  }
  return out;
}

/** Read a dot-path leaf from a message object (or undefined). */
export function getPath(obj: Messages, key: string): string | undefined {
  let cur: unknown = obj;
  for (const seg of key.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Set a dot-path leaf on a message object, creating intermediate objects. */
export function setPath(obj: Messages, key: string, value: string): void {
  const segs = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    if (typeof cur[seg] !== "object" || cur[seg] === null) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

/** Deep-clone the base catalog and apply the flat override map onto it. */
export function applyOverrides(
  base: Messages,
  overrides: Record<string, string>,
): Messages {
  const clone: Messages = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && value.length > 0) setPath(clone, key, value);
  }
  return clone;
}
