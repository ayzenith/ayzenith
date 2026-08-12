import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

/**
 * Root layout for the Enterprise CMS branch (/admin).
 *
 * This is a SECOND root layout, living in the (admin) route group so it is fully
 * independent from the localized public site: its own <html>, no next-intl, no
 * analytics, no public SEO. The CMS is a single-language (English) internal tool
 * and must never be indexed.
 */

export const metadata: Metadata = {
  title: "AYZENITH Panel",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="light" className={fontVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
