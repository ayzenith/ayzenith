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
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500"],
  fallback: ["SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/** Combined font variable classes for the <html> element. */
export const fontVariables = `${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`;
