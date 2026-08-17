import type { Metadata } from "next";
import { listCategories } from "@/server/os/items";
import { ItemForm } from "@/components/os/item-form";
import { PageHead } from "@/components/os/ui";
import { createItemAction } from "../actions";

export const metadata: Metadata = { title: "Yeni ürün · Business OS" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <>
      <PageHead
        title="Yeni ürün"
        description="Stok kodu ve ad yeterli. Fiyatları sonra da girebilirsin."
        back={{ href: "/os/products", label: "Ürünler" }}
      />
      <div className="max-w-3xl">
        <ItemForm
          action={createItemAction}
          submitLabel="Ürünü kaydet"
          cancelHref="/os/products"
          categories={categories}
        />
      </div>
    </>
  );
}
