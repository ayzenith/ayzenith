import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getItem, listCategories } from "@/server/os/items";
import { ItemForm } from "@/components/os/item-form";
import { PageHead, btn } from "@/components/os/ui";
import { deleteItemAction, updateItemAction } from "../../actions";

export const metadata: Metadata = { title: "Ürünü düzenle · Business OS" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, categories] = await Promise.all([getItem(id), listCategories()]);
  if (!item) notFound();

  return (
    <>
      <PageHead title={`${item.name} — düzenle`} back={{ href: `/os/products/${id}`, label: item.name }} />
      <div className="max-w-3xl">
        <ItemForm
          action={updateItemAction}
          submitLabel="Değişiklikleri kaydet"
          cancelHref={`/os/products/${id}`}
          categories={categories}
          values={{
            id: item.id,
            sku: item.sku,
            name: item.name,
            barcode: item.barcode,
            category: item.category,
            brand: item.brand,
            unit: item.unit,
            purchasePrice: item.purchasePrice,
            purchaseCurrency: item.purchaseCurrency,
            salePrice: item.salePrice,
            saleCurrency: item.saleCurrency,
            vatRate: item.vatRate,
            minStock: item.minStock,
            description: item.description,
            notes: item.notes,
            active: item.active,
          }}
        />

        <form action={deleteItemAction} className="mt-8 border-t border-border pt-6">
          <input type="hidden" name="id" value={item.id} />
          <p className="mb-3 text-caption text-subtle">
            Stok hareketi veya belge satırı olan ürün silinmez — stok geçmişini bozmamak için pasife
            alınır.
          </p>
          <button type="submit" className={btn.danger}>
            Ürünü sil
          </button>
        </form>
      </div>
    </>
  );
}
