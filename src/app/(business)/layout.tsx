import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

/**
 * Root layout for AYZENITH Business OS (/os).
 *
 * A THIRD root layout, alongside the localized public site and the CMS. Business
 * OS gets its own `<html>` for the same reasons the CMS does — no next-intl, no
 * analytics, no public SEO — and for one more: the marketing pages are statically
 * rendered, and a shared layout is exactly how a dynamic dependency leaks into a
 * static tree and quietly turns every public page into a per-request render.
 *
 * Nothing under this route group may import from `src/app/[locale]/*` or
 * `src/components/sections/*`.
 */

export const metadata: Metadata = {
  title: "AYZENITH Business OS",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function BusinessRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="light" className={fontVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
