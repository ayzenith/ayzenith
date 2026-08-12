import Image from "next/image";
import { assets, type AssetKey, type AssetDescriptor } from "@/config/assets";
import { getAssetOverrides } from "@/server/assets";
import { cn } from "@/lib/utils";

/**
 * Media — the one component that renders registry-backed imagery.
 *
 * It reads a semantic key from the asset registry and renders EITHER an
 * optimized next/image (AVIF/WebP, responsive srcset, blur-up) OR an on-brand
 * CSS placeholder — with identical layout and aspect ratio either way. So a page
 * built today with placeholders becomes a page with photography by editing only
 * config/assets.ts. Business logic never touches a file path.
 *
 * The owner can also swap any slot's image from the "Sayfalar & Metinler → Görseller"
 * panel: a DB override (getAssetOverrides, fail-safe) wins over the compiled
 * registry entry, so a placeholder becomes real photography with no code change.
 *
 * Async Server Component (reads the override map). Used only in the server-
 * rendered marketing pages; the layout is identical whether a slot resolves to
 * an override, a registry image, or a placeholder.
 */

type Aspect = "square" | "video" | "portrait" | "wide" | "ultrawide";
type Rounded = "none" | "md" | "lg" | "xl" | "2xl";

const aspectClass: Record<Aspect, string> = {
  square: "aspect-square",
  video: "aspect-video", // 16:9
  portrait: "aspect-[3/4]",
  wide: "aspect-[3/2]",
  ultrawide: "aspect-[21/9]",
};

const roundedClass: Record<Rounded, string> = {
  none: "rounded-none",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

type MediaProps = {
  assetKey: AssetKey;
  /** Alt text — applied when a real image is present; ignored for placeholders. */
  alt: string;
  aspect?: Aspect;
  rounded?: Rounded;
  /** next/image sizes hint; keep close to the real rendered width. */
  sizes?: string;
  priority?: boolean;
  /** Navy scrim for legible text overlays. */
  overlay?: boolean;
  className?: string;
};

export async function Media({
  assetKey,
  alt,
  aspect = "video",
  rounded = "lg",
  sizes = "100vw",
  priority = false,
  overlay = false,
  className,
}: MediaProps) {
  // Widen to the union: every registry entry is a placeholder today, so TS
  // narrows the value to that variant. The assertion restores the full union
  // (entries become images tomorrow — a registry-only change), so the component
  // legitimately handles both branches.
  const asset = assets[assetKey] as AssetDescriptor;

  // An owner-set override (Media Library URL) wins over the registry entry.
  const overrides = await getAssetOverrides();
  const overrideSrc = overrides[assetKey];

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden border border-border bg-surface",
        aspectClass[aspect],
        roundedClass[rounded],
        className,
      )}
    >
      {overrideSrc ? (
        <Image
          src={overrideSrc}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : asset.kind === "image" ? (
        <Image
          src={asset.src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          placeholder={asset.blurDataURL ? "blur" : "empty"}
          blurDataURL={asset.blurDataURL}
        />
      ) : (
        <MediaPlaceholder tone={asset.tone ?? "navy"} />
      )}

      {overlay ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(5,11,20,0.72)_100%)]"
        />
      ) : null}
    </div>
  );
}

/**
 * Optimized placeholder surface — pure CSS (zero bytes, zero requests): layered
 * navy depth, the faint precision grid, and a single restrained glint. Marked
 * decorative. Matches the visual language so pages read as finished before the
 * real assets land.
 */
function MediaPlaceholder({ tone }: { tone: "navy" | "gold" }) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#081422_0%,#0a1a2f_60%,#0d2137_100%)]" />
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(180,196,214,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(180,196,214,0.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(120%_100%_at_30%_0%,#000_10%,transparent_80%)]" />
      <div
        className={cn(
          "absolute inset-0",
          tone === "gold"
            ? "bg-[radial-gradient(55%_60%_at_70%_20%,rgba(201,162,39,0.16),transparent_70%)]"
            : "bg-[radial-gradient(55%_60%_at_25%_15%,rgba(201,162,39,0.08),transparent_70%)]",
        )}
      />
    </div>
  );
}
