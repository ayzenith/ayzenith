import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProductImage } from "@/components/products/product-image";
import { pick, type Availability, type Product } from "@/config/products";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * ProductCard — a premium showcase card (image, badge, name, short description,
 * category, availability). Server Component: it links to the product detail page
 * with a real, crawlable anchor and ships zero client JS. Visual language reuses
 * the site's card tokens (surface, border, gold, motion curve) so it reads as
 * original to the design.
 */

const availabilityDot: Record<Availability, string> = {
  "in-stock": "bg-[#3f9c5a]",
  limited: "bg-gold-500",
  "coming-soon": "bg-subtle",
};

type ProductCardProps = {
  product: Product;
  /** Priority-load the image for above-the-fold cards. */
  priority?: boolean;
};

export async function ProductCard({ product, priority = false }: ProductCardProps) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("products");

  const category = t(`categories.${product.categoryKey}.title`);
  const short = pick(product.shortDescription, locale);
  const availabilityLabel = t(`card.availability.${product.availability}`);
  const badgeLabel = product.badge ? t(`card.badges.${product.badge}`) : null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      aria-label={`${product.name} — ${t("card.viewDetails")}`}
    >
      <article className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-0.5 group-hover:border-accent/40 group-hover:shadow-md">
        <div className="relative">
          <ProductImage
            src={product.image}
            alt={product.name}
            aspect="square"
            priority={priority}
          />
          {badgeLabel ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-gold-500 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-navy-950 shadow-sm">
              {badgeLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex flex-1 flex-col">
          <p className="eyebrow text-accent">{category}</p>
          <h3 className="mt-2 font-sans text-h6 font-semibold text-foreground">
            {product.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-small text-muted">{short}</p>

          <div className="mt-auto flex items-center gap-2 pt-5">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", availabilityDot[product.availability])}
            />
            <span className="text-caption text-subtle">{availabilityLabel}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
