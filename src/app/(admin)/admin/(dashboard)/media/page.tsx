import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listMedia } from "@/server/media";
import { PageHeader } from "@/components/admin/page-header";
import { MediaLibrary } from "@/components/admin/media/media-library";

export const metadata: Metadata = { title: "Medya · AYZENITH" };

export default async function MediaPage() {
  await requireUser();
  const media = await listMedia();

  return (
    <>
      <PageHeader
        title="Medya Kütüphanesi"
        description="Görselleri yükleyin, adlandırın ve yönetin. Ürünlerde bu görselleri seçebilirsiniz."
      />
      <MediaLibrary initial={media} />
    </>
  );
}
