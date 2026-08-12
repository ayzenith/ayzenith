import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProductImage — renders a product photo OR an on-brand CSS placeholder with
 * identical layout either way, mirroring the site's <Media> pattern. Product
 * images are data-driven (many, dynamic) rather than registry keys, so this
 * accepts a `src` string (or null → placeholder). Isomorphic: safe in Server
 * and Client trees. next/image lazy-loads by default unless `priority`.
 */

type Aspect = "square" | "video" | "wide";

const aspectClass: Record<Aspect, string> = {
  square: "aspect-square",
  video: "aspect-video",
  wide: "aspect-[3/2]",
};

type ProductImageProps = {
  src: string | null;
  alt: string;
  aspect?: Aspect;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

export function ProductImage({
  src,
  alt,
  aspect = "square",
  sizes = "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw",
  priority = false,
  className,
}: ProductImageProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-md border border-border bg-surface-sunken",
        aspectClass[aspect],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(18,50,82,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(18,50,82,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(120%_100%_at_50%_0%,#000_10%,transparent_85%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_35%,rgba(201,162,39,0.07),transparent_70%)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="size-10 text-subtle" strokeWidth={1.25} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
