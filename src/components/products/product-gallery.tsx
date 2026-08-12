"use client";

import { useState } from "react";
import { ProductImage } from "@/components/products/product-image";
import { cn } from "@/lib/utils";

/**
 * ProductGallery — large primary image with a thumbnail strip.
 *
 * WHY CLIENT: selecting a thumbnail is interactive state. It is the only
 * interactive piece of the detail page; everything else stays a Server
 * Component. Non-primary images lazy-load (only the active/primary image is
 * priority), keeping the detail page's Core Web Vitals intact.
 */

export type GalleryImage = { src: string | null; alt: string };

export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const safe: GalleryImage[] =
    images.length > 0 ? images : [{ src: null, alt: "" }];
  const [active, setActive] = useState(0);
  const current = safe[Math.min(active, safe.length - 1)] ?? {
    src: null,
    alt: "",
  };

  return (
    <div>
      <ProductImage
        src={current.src}
        alt={current.alt}
        aspect="square"
        priority
        sizes="(min-width: 1024px) 560px, 90vw"
      />

      {safe.length > 1 ? (
        <ul className="mt-4 grid grid-cols-4 gap-3">
          {safe.map((img, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-current={index === active}
                aria-label={`${index + 1}`}
                className={cn(
                  "block w-full rounded-md transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]",
                  index === active
                    ? "outline outline-2 outline-accent"
                    : "opacity-70 hover:opacity-100",
                )}
              >
                <ProductImage src={img.src} alt="" aspect="square" sizes="120px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
