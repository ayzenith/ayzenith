import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Programmatic robots.txt. Fully indexable; points crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
