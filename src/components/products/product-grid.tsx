import { Reveal } from "@/components/ui/reveal";
import { ProductCard } from "@/components/products/product-card";
import type { Product } from "@/config/products";
import { cn } from "@/lib/utils";

/**
 * ProductGrid — responsive grid of ProductCards with the site's staggered
 * scroll-reveal. Server Component wrapper; the async cards render on the server.
 */

type ProductGridProps = {
  products: readonly Product[];
  /** How many leading images to priority-load (above the fold). */
  priorityCount?: number;
  columns?: 3 | 4;
  className?: string;
};

export function ProductGrid({
  products,
  priorityCount = 0,
  columns = 3,
  className,
}: ProductGridProps) {
  return (
    <ul
      className={cn(
        "grid gap-6 sm:grid-cols-2",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {products.map((product, index) => (
        <Reveal as="li" key={product.slug} delay={index * 0.05}>
          <ProductCard product={product} priority={index < priorityCount} />
        </Reveal>
      ))}
    </ul>
  );
}
