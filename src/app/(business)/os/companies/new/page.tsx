import type { Metadata } from "next";
import { getOsSettings } from "@/server/os/settings";
import { PartyForm } from "@/components/os/party-form";
import { PageHead } from "@/components/os/ui";
import { createPartyAction } from "../actions";

export const metadata: Metadata = { title: "Yeni firma · Business OS" };
export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const settings = await getOsSettings();
  return (
    <>
      <PageHead
        title="Yeni firma"
        description="Sadece firma adı zorunlu. Kalan bilgileri öğrendikçe eklersin."
        back={{ href: "/os/companies", label: "Firmalar" }}
      />
      <div className="max-w-3xl">
        <PartyForm
          action={createPartyAction}
          submitLabel="Firmayı kaydet"
          cancelHref="/os/companies"
          defaultCountry={settings.defaultCountry}
        />
      </div>
    </>
  );
}
