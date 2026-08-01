import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Web App Manifest. Dark-first brand surface, navy background, gold theme.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#050b14",
    theme_color: "#0a1a2f",
    icons: [
      {
        src: "/brand/ayzenith-logo.png",
        sizes: "1920x1080",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
