import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy.
 *
 * Analytics hosts (GA4, GTM, Clarity) are pre-allow-listed so enabling analytics
 * is pure configuration — no header change. Inline script/style are permitted
 * because the Next.js App Router injects inline hydration scripts and libraries
 * emit inline style attributes; on a fully-static site this is the pragmatic
 * posture. V2 hardening: nonce-based CSP via middleware (trades static rendering
 * for per-request nonces — deferred deliberately to protect Core Web Vitals).
 */
const isDev = process.env.NODE_ENV === "development";

// Next.js dev (Fast Refresh / HMR) evaluates code with eval(), so 'unsafe-eval'
// is required in development only. Production keeps the strict policy without it.
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isDev ? "'unsafe-eval'" : "",
  "https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms https://*.clarity.ms",
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://ggpjxtlxgmjxnmynuelh.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://*.clarity.ms",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms" +
    (isDev ? " ws: http://localhost:*" : ""),
  "frame-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Modern, tree-shakeable image formats. remotePatterns stays empty until a
  // trusted asset host is introduced — nothing untrusted ships to users.
  images: {
    formats: ["image/avif", "image/webp"],
    // Supabase Storage (public "media" bucket) is the trusted host for
    // CMS-uploaded product/media images.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ggpjxtlxgmjxnmynuelh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Ship less JavaScript: pull only what is used from these packages.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
