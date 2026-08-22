/**
 * Media registry — the single source of truth for every non-logo visual asset.
 *
 * Components reference a SEMANTIC KEY (e.g. "about.operations"), never a file
 * path. Swapping a placeholder for real photography/illustration — or a PNG for
 * an AVIF — is a one-line change here: flip `kind` to "image" and supply `src`,
 * `width`, `height` (and optionally a `blurDataURL`). No component, layout, or
 * page code changes. The codebase stays asset-independent (Sprint 2 mandate).
 *
 * Until final assets are delivered, every slot renders as an optimized,
 * zero-byte CSS placeholder surface (see <Media> / MediaPlaceholder) — no
 * network request, no layout shift, on-brand.
 */

import type { GraphicKey } from "@/components/ui/media-graphics";

export type AssetDescriptor =
  | {
      readonly kind: "image";
      readonly src: string;
      readonly width: number;
      readonly height: number;
      /** Tiny base64 LQIP for blur-up; optional. */
      readonly blurDataURL?: string;
    }
  | {
      /** Inline SVG figure drawn on the placeholder ground — zero bytes over the wire. */
      readonly kind: "graphic";
      readonly figure: GraphicKey;
      readonly tone?: "navy" | "gold";
    }
  | {
      readonly kind: "placeholder";
      /** Visual treatment of the placeholder surface. */
      readonly tone?: "navy" | "gold";
    };

export const assets = {
  // — About —
  "about.operations": { kind: "placeholder", tone: "navy" },
  "about.accountability": { kind: "placeholder", tone: "navy" },

  // — Services —
  "services.sourcing": { kind: "graphic", figure: "globeNetwork", tone: "navy" },
  "services.distribution": { kind: "graphic", figure: "routeFlow", tone: "navy" },
  "services.privateLabel": { kind: "graphic", figure: "labelMark", tone: "gold" },
  "services.partnerships": { kind: "graphic", figure: "interlock", tone: "navy" },

  // — Export management —
  "export.rights": { kind: "graphic", figure: "mandate", tone: "gold" },
  "export.distribution": { kind: "graphic", figure: "channelWeb", tone: "navy" },
  "export.market": { kind: "graphic", figure: "marketGate", tone: "navy" },
  "export.operations": { kind: "graphic", figure: "routeFlow", tone: "navy" },

  // — Products —
  "products.technology": { kind: "placeholder", tone: "navy" },
  "products.consumer": { kind: "placeholder", tone: "navy" },
  "products.textile": { kind: "placeholder", tone: "gold" },
} satisfies Record<string, AssetDescriptor>;

export type AssetKey = keyof typeof assets;
