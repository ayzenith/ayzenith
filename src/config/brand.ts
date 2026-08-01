/**
 * Brand assets — single source of truth for the official AYZENITH logo.
 *
 * The <Logo> component reads ONLY from here, so swapping the raster for an
 * optimized SVG (or a tightly-cropped / horizontal export) is a one-line change
 * to `src` + intrinsic size — no component or page is touched. The current file
 * is the approved transparent PNG (RGBA, 1920×1080).
 *
 * USAGE RULES (Enterprise Design Manual — logo governance):
 *  • tone "brand"  → navy + gold artwork, for LIGHT surfaces (documents, light
 *    themes, print). Full color, full fidelity.
 *  • tone "light"  → reversed monochrome, for DARK surfaces (the marketing site:
 *    navbar over the hero, footer, mobile menu). Navy is invisible on navy, so
 *    the mark is rendered in off-white. (This reversed treatment renders the
 *    whole mark one color; a dedicated reversed export that KEEPS the gold "E"
 *    can be dropped in later as `logo.reversed` with no code change.)
 *  • Never stretch, recolor arbitrarily, rotate, or place on low-contrast
 *    backgrounds. Preserve clear space ≥ the height of the monogram's base.
 *  • Minimum rendered height: 28px (mark legibility floor).
 */

export const brandAssets = {
  logo: {
    /** The approved full lockup: monogram + wordmark, transparent background. */
    full: {
      src: "/brand/ayzenith-logo.png",
      width: 1920,
      height: 1080,
    },
  },
} as const;

/** Accessible name for the logo when it is the brand's primary identifier. */
export const LOGO_ALT = "AYZENITH";
