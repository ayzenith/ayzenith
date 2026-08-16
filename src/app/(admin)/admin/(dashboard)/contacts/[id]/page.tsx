import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Building2, Globe, Tag, Clock } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getContactMessage, setContactStatus } from "@/server/contact";
import { PageHeader } from "@/components/admin/page-header";
import { ContactDetailActions } from "@/components/admin/contacts/contact-detail";
import { interestLabel, regionLabel } from "@/config/contact-labels";

export const metadata: Metadata = { title: "Mesaj · AYZENITH" };
export const dynamic = "force-dynamic";

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-caption text-subtle">{label}</p>
        <p className="text-small text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [, message] = await Promise.all([requireUser(), getContactMessage(id)]);
  if (!message) notFound();

  // Opening a NEW inquiry marks it read.
  if (message.status === "NEW") {
    await setContactStatus(id, "READ");
    message.status = "READ";
  }

  const date = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(message.createdAt);

  return (
    <>
      <Link
        href="/admin/contacts"
        className="mb-4 inline-flex items-center gap-1 text-small text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Mesajlara dön
      </Link>

      <PageHeader title={message.company} description={`${message.name} · ${date}`} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-h6 font-semibold text-foreground">Mesaj</h2>
            <p className="mt-3 whitespace-pre-wrap text-body text-muted">{message.message}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={Building2} label="Firma" value={message.company} />
              <InfoRow icon={Mail} label="E-posta" value={message.email} />
              <InfoRow icon={Globe} label="Bölge" value={regionLabel(message.region)} />
              <InfoRow icon={Tag} label="İlgi alanı" value={interestLabel(message.interest)} />
              <InfoRow icon={Clock} label="Tarih" value={date} />
            </div>
            <a
              href={`mailto:${message.email}?subject=${encodeURIComponent("AYZENITH — " + message.company)}`}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-navy-950 px-4 text-small font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Mail className="size-4" aria-hidden="true" /> E-posta ile yanıtla
            </a>
          </section>
        </div>

        <aside className="rounded-xl border border-border bg-surface p-6">
          <ContactDetailActions id={message.id} status={message.status} notes={message.notes} />
        </aside>
      </div>
    </>
  );
}
