import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { getSiteSettings } from "@/server/settings";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings/settings-form";

export const metadata: Metadata = { title: "Ayarlar · AYZENITH" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("ADMIN");
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader
        title="Site Ayarları"
        description="Firma iletişim bilgileri, sosyal medya ve analitik. Değişiklikler sitede anında görünür."
      />
      <SettingsForm settings={settings} />
    </>
  );
}
