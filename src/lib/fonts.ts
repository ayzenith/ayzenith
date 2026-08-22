import { Inter, Newsreader, IBM_Plex_Mono } from "next/font/google";

/**
 * Typography — governed by the Enterprise Design Manual.
 *
 * Primary (Inter): neo-grotesque for headlines & UI. International, precise,
 *   timeless. `display` swap avoids invisible text (FOIT) and protects LCP.
 * Secondary (Newsreader): optical serif for editorial / emotional moments
 *   (the story, pull-quotes, the vision peak). Loaded weights kept minimal.
 * Monospace (IBM Plex Mono): tabular figures for data and reference numbers.
 *
 * Each is exposed as a CSS variable consumed by the @theme layer in globals.css,
 * so fonts are self-hosted, subset, and preloaded by next/font — zero layout
 * shift and no render-blocking third-party requests.
 *
 * ONLY INTER IS PRELOADED. All three families are declared in the root layout,
 * so next/font used to emit a <link rel="preload"> for every face on every page
 * — measured on /services, that fetched 233 KB of Newsreader and IBM Plex Mono
 * onto a page that renders nothing in either. The serif and mono faces now load
 * on demand, from the @font-face rule, only where a page actually sets them;
 * `display: swap` covers the gap with the fallback stack.
 */

// The next/font variables are named distinctly from the Tailwind theme font
// tokens (--font-sans / --font-serif / --font-mono). The theme tokens in
// globals.css point AT these — never share a name, or the token would reference
// itself and collapse to a fallback.
export const fontSans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
  // 400/500/600 cover body, emphasis and all headings/buttons. No 700 is used
  // anywhere in the UI, so it is not shipped (one fewer font file).
  weight: ["400", "500", "600"],
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
});

export const fontSerif = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-newsreader",
  display: "swap",
  weight: ["400", "500"],
  style: ["normal", "italic"],
  // Editorial moments only — the homepage pull-quotes, the about story, the
  // mobile menu. Most pages never set it, so it is fetched on use, not upfront.
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-plex-mono",
  display: "swap",
  // Every `font-mono` in the codebase renders at the regular weight — reference
  // numbers, SKUs, IBANs, tabular figures. 500 was shipped and never asked for.
  weight: ["400"],
  // Data and reference numbers, on a handful of screens. Same reasoning as the
  // serif above: not worth a preload on pages that never render a monospace glyph.
  preload: false,
  fallback: ["SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/** Combined font variable classes for the <html> element. */
export const fontVariables = `${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`;
