import type { Metadata } from "next";
import { listParties } from "@/server/os/parties";
import { listItems } from "@/server/os/items";
import { listLocations } from "@/server/os/inventory";
import { getOsSettings } from "@/server/os/settings";
import { suggestRates } from "@/server/os/fx";
import { istanbulDay } from "@/server/os/fx-tcmb";
import { createPurchaseAction } from "../actions";
import { fxRatesForDayAction } from "../../fx-actions";
import { PurchaseForm, type PurchaseFormInitial } from "@/components/os/purchase-form";
import { Note, PageHead } from "@/components/os/ui";
import { purchasePrefillFromCase } from "@/server/import/purchase-link";

export const metadata: Metadata = { title: "Yeni alış · Business OS" };
export const dynamic = "force-dynamic";

export default async function NewPurchase({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const importCaseId = typeof sp.importCase === "string" ? sp.importCase : null;
  const prefill: { initial: PurchaseFormInitial; notes: string[]; code: string } | null = importCaseId ? await purchasePrefillFromCase(importCaseId) : null;
  const [suppliers, items, locations, settings] = await Promise.all([
    listParties({ role: "SUPPLIER", perPage: 200 }),
    listItems({ perPage: 200, active: true }),
    listLocations(),
    getOsSettings(),
  ]);
  const today = istanbulDay();
  const rates = await suggestRates(today, undefined, settings);

  return (
    <>
      <PageHead title="Yeni alış" back={{ href: "/os/purchases", label: "Alışlar" }} />
      {prefill ? (
        <div className="mb-4">
          <Note>
            İthalat analizi {prefill.code} bilgileriyle dolduruldu. Kontrol edip kaydedin. {prefill.notes.join(" ")}
          </Note>
        </div>
      ) : null}
      <PurchaseForm
        action={createPurchaseAction}
        items={items.rows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, purchasePrice: i.purchasePrice, purchaseCurrency: i.purchaseCurrency }))}
        suppliers={suppliers.rows.map((p) => ({ id: p.id, name: p.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        baseCurrency={settings.baseCurrency}
        initialDay={today}
        initialRates={rates}
        getRates={fxRatesForDayAction}
        initial={prefill?.initial}
      />
    </>
  );
}
