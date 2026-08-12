import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { getRadarSettings } from "@/server/radar/settings";
import { RADAR_CATEGORIES } from "@/config/radar";
import { PageHeader } from "@/components/admin/page-header";
import { RadarSettingsForm } from "@/components/admin/radar/settings-form";

export const metadata: Metadata = { title: "RADAR Ayarları · AYZENITH", robots: { index: false, follow: false } };

export default async function RadarSettingsPage() {
  await requireRole("ADMIN");
  const s = await getRadarSettings();

  return (
    <>
      <PageHeader
        title="RADAR Ayarları"
        description="Skorlama ağırlıkları, karar eşikleri ve takip davranışı. Değişiklikler yalnızca yeni analizleri etkiler."
      />
      <RadarSettingsForm
        weights={s.weights}
        thresholds={s.thresholds}
        alertThreshold={s.alertThreshold}
        cacheTtlDays={s.cacheTtlDays}
        certificationBurden={s.certificationBurden}
        categories={RADAR_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
      />
    </>
  );
}
