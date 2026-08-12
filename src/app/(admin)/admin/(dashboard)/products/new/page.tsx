import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listMedia } from "@/server/media";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";

export const metadata: Metadata = { title: "Yeni ürün · AYZENITH" };

export default async function NewProductPage() {
  await requireUser();
  const media = await listMedia();
  return (
    <>
      <PageHeader
        title="Yeni ürün"
        description="Ürün bilgilerini üç dilde doldurun. Kaydettikten sonra durumunu “Yayında” yaparak sitede gösterebilirsiniz."
      />
      <ProductForm library={media} />
    </>
  );
}
