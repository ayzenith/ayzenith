import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Check, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { CTASection } from "@/components/sections/cta-section";
import { AvailableOn } from "@/components/products/available-on";
import { ProductGallery, type GalleryImage } from "@/components/products/product-gallery";
import { ProductGrid } from "@/components/products/product-grid";
import { getProductBySlug, getRelatedProducts } from "@/server/products";
import { pick, type Availability } from "@/config/products";
import { siteConfig } from "@/config/site";
import { buildMetadata, productStructuredData } from "@/lib/seo";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Product detail page — a premium showcase (no price, no cart, no checkout).
 * Server Component throughout; the only client island is the gallery. Content is
 * fully localized, with per-product metadata (canonical, OG image) and
 * schema.org/Product structured data.
 */

// DB-backed, CMS-editable — always render fresh (no build-time snapshot).
export const revalidate = 0;

type Params = { locale: string; slug: string };

function localizedProductUrl(locale: Locale, slug: string): string {
  const path =
    locale === routing.defaultLocale
      ? `/products/${slug}`
      : `/${locale}/products/${slug}`;
  return `${siteConfig.url}${path}`;
}

const availabilityDot: Record<Availability, string> = {
  "in-stock": "bg-[#3f9c5a]",
  limited: "bg-gold-500",
  "coming-soon": "bg-subtle",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const locale = (await getLocale()) as Locale;
  return buildMetadata({
    title: product.name,
    description: pick(product.shortDescription, locale),
    path: `/products/${product.slug}`,
    image: product.image ?? undefined,
  });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("products");
  const td = await getTranslations("products.detail");

  const category = t(`categories.${product.categoryKey}.title`);
  const shortDescription = pick(product.shortDescription, locale);
  const description = pick(product.description, locale);
  const features = pick(product.features, locale);
  const useCases = pick(product.useCases, locale);
  const availabilityLabel = t(`card.availability.${product.availability}`);
  const badgeLabel = product.badge ? t(`card.badges.${product.badge}`) : null;

  const specs = product.specs.map((s) => ({
    label: pick(s.label, locale),
    value: s.value,
  }));

  const realImages = [product.image, ...product.gallery].filter(
    (s): s is string => Boolean(s),
  );
  const galleryImages: GalleryImage[] =
    realImages.length > 0
      ? realImages.map((src) => ({ src, alt: product.name }))
      : [{ src: null, alt: product.name }];

  const related = await getRelatedProducts(product.slug, 3);

  const jsonLd = productStructuredData({
    name: product.name,
    description,
    category,
    image: product.image,
    url: localizedProductUrl(locale, product.slug),
    specs,
  });

  return (
    <>
      <script
        type="application/ld+json"
        // Developer-authored, static per-product structured data.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Overview: gallery + primary info */}
      <section className="relative pt-36 md:pt-44">
        <Container>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-caption text-subtle"
          >
            <Link href="/products" className="transition-colors hover:text-accent">
              {td("breadcrumbProducts")}
            </Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span className="text-muted">{product.name}</span>
          </nav>

          <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <ProductGallery images={galleryImages} />
            </Reveal>

            <Reveal delay={0.05} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3">
                <p className="eyebrow text-accent">{category}</p>
                {badgeLabel ? (
                  <span className="inline-flex items-center rounded-full bg-gold-500 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-navy-950">
                    {badgeLabel}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-balance font-sans text-h1 font-semibold leading-[1.08] text-foreground">
                {product.name}
              </h1>

              <p className="mt-5 text-body-lg text-muted">{shortDescription}</p>

              <div className="mt-6 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full",
                    availabilityDot[product.availability],
                  )}
                />
                <span className="text-small text-muted">{availabilityLabel}</span>
              </div>

              <div className="mt-8">
                <AvailableOn urls={product.marketplaces} />
              </div>

              <div className="mt-8 rounded-lg border border-border bg-surface-sunken p-6">
                <p className="font-sans text-h6 font-semibold text-foreground">
                  {td("wholesaleTitle")}
                </p>
                <p className="mt-2 text-small text-muted">{td("wholesaleBody")}</p>
                <Button asChild className="mt-5">
                  <Link href="/contact">{td("wholesaleCta")}</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Description, features, use cases + specifications */}
      <Section labelledBy="overview-heading" tone="gray">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
            <Reveal>
              <h2
                id="overview-heading"
                className="font-sans text-h3 font-semibold text-foreground"
              >
                {td("overview")}
              </h2>
              <p className="mt-5 text-body text-muted">{description}</p>

              {features.length > 0 ? (
                <>
                  <h3 className="mt-10 font-sans text-h5 font-semibold text-foreground">
                    {td("features")}
                  </h3>
                  <ul className="mt-4 space-y-3">
                    {features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-body text-muted">
                        <Check
                          className="mt-1 size-4 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {useCases.length > 0 ? (
                <>
                  <h3 className="mt-10 font-sans text-h5 font-semibold text-foreground">
                    {td("useCases")}
                  </h3>
                  <ul className="mt-4 flex flex-wrap gap-2.5">
                    {useCases.map((useCase) => (
                      <li
                        key={useCase}
                        className="inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-caption text-muted"
                      >
                        {useCase}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Reveal>

            <Reveal delay={0.05}>
              <h2 className="font-sans text-h5 font-semibold text-foreground">
                {td("specifications")}
              </h2>
              <dl className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex items-baseline justify-between gap-4 px-5 py-3.5"
                  >
                    <dt className="text-small text-muted">{spec.label}</dt>
                    <dd className="text-right text-small font-medium text-foreground">
                      {spec.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {product.downloads && product.downloads.length > 0 ? (
                <div className="mt-8">
                  <h3 className="font-sans text-h6 font-semibold text-foreground">
                    {td("downloads")}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {product.downloads.map((dl) => (
                      <li key={dl.href}>
                        <a
                          href={dl.href}
                          className="text-small text-accent underline-offset-4 hover:underline"
                        >
                          {pick(dl.label, locale)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Related products */}
      {related.length > 0 ? (
        <Section labelledBy="related-heading">
          <Container>
            <Reveal>
              <h2
                id="related-heading"
                className="font-sans text-h3 font-semibold text-foreground"
              >
                {td("related")}
              </h2>
            </Reveal>
            <div className="mt-10">
              <ProductGrid products={related} />
            </div>
          </Container>
        </Section>
      ) : null}

      <CTASection />
    </>
  );
}
