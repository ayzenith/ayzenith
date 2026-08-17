import type { Metadata } from "next";
import { listParties } from "@/server/os/parties";
import { listItems } from "@/server/os/items";
import { listChannels } from "@/server/os/channels";
import { listLocations } from "@/server/os/inventory";
import { getOsSettings } from "@/server/os/settings";
import { createSaleAction, priceForAction } from "../actions";
import { SaleForm } from "@/components/os/sale-form";
import { PageHead } from "@/components/os/ui";

export const metadata: Metadata = { title: "Yeni satış · Business OS" };
export const dynamic = "force-dynamic";

export default async function NewSale() {
  const [parties, items, channels, locations, settings] = await Promise.all([
    listParties({ role: "CUSTOMER", perPage: 200 }),
    listItems({ perPage: 200, active: true }),
    listChannels({ activeOnly: true }),
    listLocations(),
    getOsSettings(),
  ]);

  return (
    <>
      <PageHead title="Yeni satış" back={{ href: "/os/sales", label: "Satışlar" }} />
      <SaleForm
        action={createSaleAction}
        getPrice={priceForAction}
        items={items.rows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, salePrice: i.salePrice, saleCurrency: i.saleCurrency }))}
        parties={parties.rows.map((p) => ({ id: p.id, name: p.name }))}
        channels={channels.map((c) => ({ id: c.id, name: c.name, commissionRate: c.commissionRate }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        baseCurrency={settings.baseCurrency}
        fxRates={settings.fxRates}
      />
    </>
  );
}
