import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getAdminProductById } from "@/server/products";
import { listMedia } from "@/server/media";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";

export const metadata: Metadata = { title: "Ürün düzenle · AYZENITH" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [product, media] = await Promise.all([
    getAdminProductById(id),
    listMedia(),
  ]);
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title="Ürünü düzenle"
        description={product.name}
      />
      <ProductForm initial={product} library={media} />
    </>
  );
}
