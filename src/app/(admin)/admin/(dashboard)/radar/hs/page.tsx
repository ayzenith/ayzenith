import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { listAllHs } from "@/server/radar/hs";
import { RADAR_CATEGORIES } from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { HsEditor, type HsRow } from "@/components/admin/radar/hs-editor";
import { seedHsAction } from "./actions";

export const metadata: Metadata = { title: "HS Eşlemeleri · RADAR", robots: { index: false, follow: false } };

export default async function HsMappingPage() {
  await requireRole("ADMIN");
  const all = await listAllHs();

  const rows: HsRow[] = all.map((r) => ({
    id: r.id,
    categoryKey: r.categoryKey,
    hs6: r.hs6,
    productGroup: r.productGroup,
    verification: r.verification,
    source: r.source,
    note: r.note,
  }));
  const categories = RADAR_CATEGORIES.map((c) => ({ key: c.key, label: c.label }));

  return (
    <>
      <PageHeader
        title="HS Eşlemeleri"
        description="Her kategoriyi hangi HS-6 kodlarının temsil ettiğini siz yönetirsiniz. Yalnızca “Doğrulandı” işaretli kodlar analizlere girer; “Doğrulama gerekli” kodlar dışarıda tutulur."
      />

      {rows.length === 0 ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <p className="text-small text-muted">
            Henüz HS eşlemesi yok. Hazırladığımız 7 kategorilik doğrulanmış başlangıç tablosunu yükleyebilirsiniz.
          </p>
          <form action={seedHsAction} className="mt-4">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white hover:opacity-90">
              Başlangıç tablosunu yükle
            </button>
          </form>
        </section>
      ) : (
        <HsEditor categories={categories} rows={rows} />
      )}
    </>
  );
}
