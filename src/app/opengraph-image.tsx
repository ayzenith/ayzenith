import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

/**
 * Open Graph / social share card, generated at build with next/og (part of
 * Next — no dependency, no raster asset checked into the repo). Next auto-wires
 * this into the page metadata (openGraph.images + twitter.images), so every
 * shared link renders a branded navy/gold card. System fonts only — reliable,
 * self-contained, zero network fetch.
 */

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate on-request rather than prerendering at build. This keeps the OG card
// dynamic on the server (Vercel) and avoids a build-time prerender step that
// @vercel/og cannot complete when the project path contains non-ASCII
// characters (a local-only Windows path quirk; never an issue in production).
export const dynamic = "force-dynamic";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #050b14 0%, #081422 55%, #0a1a2f 100%)",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 14,
            color: "#f7f8fa",
            fontWeight: 600,
          }}
        >
          AYZENITH
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.05,
              color: "#f7f8fa",
              fontWeight: 600,
              maxWidth: 900,
              letterSpacing: -1,
            }}
          >
            Global Trade. Absolute Trust.
          </div>
          <div style={{ fontSize: 30, color: "#7c97b5", maxWidth: 820 }}>
            A global B2B commerce, sourcing and investment group.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ height: 4, width: 72, background: "#c9a227" }} />
          <div style={{ fontSize: 24, color: "#c9a227", letterSpacing: 2 }}>
            {siteConfig.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
