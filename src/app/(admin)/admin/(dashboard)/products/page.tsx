import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Package, Star } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listAllProducts } from "@/server/products";
import { PageHeader } from "@/components/admin/page-header";
import { CATEGORY_OPTIONS, STATUS_LABEL } from "@/config/product-options";
import { RowActions } from "@/components/admin/products/row-actions";
import type { ProductStatusValue } from "@/config/product-admin";

export const metadata: Metadata = { title: "Ürünler · AYZENITH" };

const categoryLabel = (key: string) =>
  CATEGORY_OPTIONS.find((c) => c.value === key)?.label ?? key;

const statusStyle: Record<ProductStatusValue, string> = {
  PUBLISHED: "bg-[#e8f3ec] text-[#2f7a48]",
  DRAFT: "bg-surface-sunken text-muted",
  HIDDEN: "bg-[#fbeaea] text-[#8a2b2b]",
};

export default async function AdminProductsPage() {
  await requireUser();
  const products = await listAllProducts();

  const published = products.filter((p) => p.status === "PUBLISHED").length;

  return (
    <>
      <PageHeader
        title="Ürünler"
        description="Ürünleri ekleyin, düzenleyin ve yayın durumunu yönetin. Yalnızca “Yayında” olanlar sitede görünür."
        actions={
          <Link
            href="/admin/products/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" aria-hidden="true" /> Yeni ürün
          </Link>
        }
      />

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <Package className="mx-auto size-8 text-subtle" aria-hidden="true" />
          <p className="mt-4 text-small font-medium text-foreground">Henüz ürün yok.</p>
          <p className="mt-1 text-caption text-subtle">İlk ürününüzü ekleyerek başlayın.</p>
          <Link
            href="/admin/products/new"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" aria-hidden="true" /> Yeni ürün
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-caption font-medium uppercase tracking-wide text-subtle">
              {products.length} ürün · {published} yayında
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-caption uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 font-medium">Ürün</th>
                  <th className="px-5 py-3 font-medium">Kategori</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id} className="align-middle">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium text-foreground">{p.name}</span>
                        {p.featured ? (
                          <Star className="size-3.5 fill-gold-500 text-gold-500" aria-label="Öne çıkan" />
                        ) : null}
                      </div>
                      <span className="text-caption text-subtle">/{p.slug}</span>
                    </td>
                    <td className="px-5 py-3.5 text-small text-muted">{categoryLabel(p.categoryKey)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-caption font-medium ${statusStyle[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <RowActions id={p.id} name={p.name} status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
