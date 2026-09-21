/**
 * IMPORT INTELLIGENCE — reading a product page (pure).
 *
 * Takes the HTML of a page the user pointed at and pulls out what it actually
 * states: schema.org Product data when the page publishes it, otherwise the
 * title, meta description and the visible text of the specification area. It
 * never infers a brand or a model from the domain name — only from the page.
 */

import { htmlToText } from "./parsers";

export type WebProduct = {
  title: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  gtin: string | null;
  material: string | null;
  description: string | null;
  /** Visible text, trimmed to what the attribute extractor needs. */
  text: string;
  /** Whether schema.org Product data was present — a much stronger signal. */
  structured: boolean;
};

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.name ?? o.value ?? null);
  }
  return null;
}

function collectJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const push = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(push);
        else if (x && typeof x === "object") {
          out.push(x as Record<string, unknown>);
          const graph = (x as { "@graph"?: unknown })["@graph"];
          if (graph) push(graph);
        }
      };
      push(parsed);
    } catch {
      // A page with broken JSON-LD is still readable as text.
    }
  }
  return out;
}

export function extractWebProduct(html: string, maxChars = 12_000): WebProduct {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? null;
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? null;

  const product = collectJsonLd(html).find((o) => {
    const type = o["@type"];
    return typeof type === "string" ? /product/i.test(type) : Array.isArray(type) && type.some((t) => typeof t === "string" && /product/i.test(t));
  });

  const props = product
    ? {
        brand: firstString(product.brand),
        model: firstString(product.model),
        sku: firstString(product.sku ?? product.mpn),
        gtin: firstString(product.gtin13 ?? product.gtin ?? product.gtin12 ?? product.gtin8 ?? product.ean),
        material: firstString(product.material),
        description: firstString(product.description),
        name: firstString(product.name),
      }
    : { brand: null, model: null, sku: null, gtin: null, material: null, description: null, name: null };

  const text = htmlToText(html).slice(0, maxChars);
  return {
    title: props.name ?? ogTitle ?? title,
    brand: props.brand,
    model: props.model,
    sku: props.sku,
    gtin: props.gtin,
    material: props.material,
    description: props.description ?? metaDesc,
    text: [props.name, props.description ?? metaDesc, props.material ? `Malzeme: ${props.material}` : null, text].filter(Boolean).join("\n").slice(0, maxChars),
    structured: !!product,
  };
}

/** Does this URL look like it belongs to the brand itself? Domain evidence only, never proof. */
export function looksLikeManufacturerDomain(url: string, brand: string | null): boolean {
  if (!brand) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const b = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (b.length < 3) return false;
    return host.replace(/[^a-z0-9.]/g, "").split(".").some((part) => part === b || part.startsWith(b) || b.startsWith(part));
  } catch {
    return false;
  }
}
