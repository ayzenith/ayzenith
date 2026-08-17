import type { Metadata } from "next";
import { listParties } from "@/server/os/parties";
import { listItems } from "@/server/os/items";
import { listLocations } from "@/server/os/inventory";
import { getOsSettings } from "@/server/os/settings";
import { createPurchaseAction } from "../actions";
import { PurchaseForm } from "@/components/os/purchase-form";
import { PageHead } from "@/components/os/ui";

export const metadata: Metadata = { title: "Yeni alış · Business OS" };
export const dynamic = "force-dynamic";

export default async function NewPurchase() {
  const [suppliers, items, locations, settings] = await Promise.all([
    listParties({ role: "SUPPLIER", perPage: 200 }),
    listItems({ perPage: 200, active: true }),
    listLocations(),
    getOsSettings(),
  ]);

  return (
    <>
      <PageHead title="Yeni alış" back={{ href: "/os/purchases", label: "Alışlar" }} />
      <PurchaseForm
        action={createPurchaseAction}
        items={items.rows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, purchasePrice: i.purchasePrice, purchaseCurrency: i.purchaseCurrency }))}
        suppliers={suppliers.rows.map((p) => ({ id: p.id, name: p.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        baseCurrency={settings.baseCurrency}
        fxRates={settings.fxRates}
      />
    </>
  );
}
