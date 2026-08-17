import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getParty } from "@/server/os/parties";
import { PartyForm } from "@/components/os/party-form";
import { PageHead, btn } from "@/components/os/ui";
import { deletePartyAction, updatePartyAction } from "../../actions";

export const metadata: Metadata = { title: "Firmayı düzenle · Business OS" };
export const dynamic = "force-dynamic";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const party = await getParty(id);
  if (!party) notFound();

  return (
    <>
      <PageHead
        title={`${party.name} — düzenle`}
        back={{ href: `/os/companies/${id}`, label: party.name }}
      />
      <div className="max-w-3xl">
        <PartyForm
          action={updatePartyAction}
          submitLabel="Değişiklikleri kaydet"
          cancelHref={`/os/companies/${id}`}
          values={{
            id: party.id,
            name: party.name,
            legalName: party.legalName,
            taxNumber: party.taxNumber,
            taxOffice: party.taxOffice,
            country: party.country,
            city: party.city,
            address: party.address,
            postalCode: party.postalCode,
            website: party.website,
            phone: party.phone,
            email: party.email,
            currency: party.currency,
            paymentTermDays: party.paymentTermDays,
            notes: party.notes,
            active: party.active,
          }}
        />

        {/* Deleting is attempted, not promised: a firm carrying documents is
            archived instead, and the action says so. */}
        <form action={deletePartyAction} className="mt-8 border-t border-border pt-6">
          <input type="hidden" name="id" value={party.id} />
          <p className="mb-3 text-caption text-subtle">
            Bu firmanın satış, alış veya ödeme kaydı varsa silinmez — geçmişi bozmamak için pasife
            alınır.
          </p>
          <button type="submit" className={btn.danger}>
            Firmayı sil
          </button>
        </form>
      </div>
    </>
  );
}
