import Image from "next/image";
import { brandAssets, LOGO_ALT } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Logo — the one component that renders the official AYZENITH mark.
 *
 * Isomorphic (no "use client"): it works inside both Server and Client trees,
 * so the Navbar (client) and Footer (server) share the exact same optimized
 * implementation. Uses next/image for AVIF/WebP conversion, responsive srcset,
 * and correct intrinsic dimensions (no layout shift).
 *
 * Height is controlled by the caller via className (e.g. "h-10"); width is
 * always auto so the aspect ratio is preserved. tone="light" applies the
 * reversed treatment for dark surfaces (see brand.ts usage rules).
 */

type LogoProps = {
  /** "brand" = navy+gold (light bg); "light" = reversed off-white (dark bg). */
  tone?: "brand" | "light";
  /** Preload for above-the-fold placement (the navbar). */
  priority?: boolean;
  /** Height + any extra classes. Width stays auto. */
  className?: string;
  /** next/image sizes hint — keep close to the real rendered width. */
  sizes?: string;
  /** Empty string marks the logo decorative when a labelled ancestor names it. */
  alt?: string;
};

export function Logo({
  tone = "brand",
  priority = false,
  className,
  sizes = "200px",
  alt = LOGO_ALT,
}: LogoProps) {
  const { src, width, height } = brandAssets.logo.full;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      className={cn(
        "w-auto select-none",
        // Reversed monochrome for dark surfaces — off-white, not pure white,
        // to stay on-brand and avoid harshness. brightness(0) collapses the
        // artwork to black; invert lifts it; the slight brightness trims it to
        // off-white to match --color-foreground.
        tone === "light" &&
          "[filter:brightness(0)_invert(1)_brightness(0.97)]",
        className,
      )}
      draggable={false}
    />
  );
}
