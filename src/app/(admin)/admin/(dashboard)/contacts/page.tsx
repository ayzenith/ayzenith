import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Download, Circle } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listContactMessages } from "@/server/contact";
import { PageHeader } from "@/components/admin/page-header";
import {
  CONTACT_STATUS_LABEL,
  interestLabel,
  regionLabel,
  type ContactStatusValue,
} from "@/config/contact-labels";

export const metadata: Metadata = { title: "Mesajlar · AYZENITH" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; status?: ContactStatusValue }[] = [
  { key: "all", label: "Tümü" },
  { key: "NEW", label: "Yeni", status: "NEW" },
  { key: "READ", label: "Okundu", status: "READ" },
  { key: "ARCHIVED", label: "Arşiv", status: "ARCHIVED" },
];

const statusStyle: Record<ContactStatusValue, string> = {
  NEW: "bg-[#e8f0fb] text-[#1f5cb8]",
  READ: "bg-surface-sunken text-muted",
  ARCHIVED: "bg-surface-sunken text-subtle",
};

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "az önce";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f.key === status) ?? FILTERS[0]!;
  const messages = await listContactMessages(active.status);

  return (
    <>
      <PageHeader
        title="Mesajlar"
        description="İletişim formundan gelen tüm başvurular. Buradan okuyabilir, arşivleyebilir ve dışa aktarabilirsiniz."
        actions={
          // A real anchor to a route handler that streams a file download —
          // next/link would try to client-navigate instead of downloading.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/admin/contacts/export"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-small font-medium text-foreground transition-colors hover:border-accent/50"
          >
            <Download className="size-4" aria-hidden="true" /> CSV indir
          </a>
        }
      />

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const isActive = f.key === active.key;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/contacts" : `/admin/contacts?status=${f.key}`}
              className={
                "inline-flex h-8 items-center rounded-lg border px-3 text-small font-medium transition-colors " +
                (isActive
                  ? "border-navy-950 bg-navy-950 text-white"
                  : "border-border bg-surface text-muted hover:border-accent/50")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <Inbox className="mx-auto size-8 text-subtle" aria-hidden="true" />
          <p className="mt-4 text-small font-medium text-foreground">Mesaj yok.</p>
          <p className="mt-1 text-caption text-subtle">
            Bu filtrede gösterilecek başvuru bulunmuyor.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {messages.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/contacts/${m.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-sunken"
                >
                  {m.status === "NEW" ? (
                    <Circle className="size-2 shrink-0 fill-[#1f5cb8] text-[#1f5cb8]" aria-label="Okunmadı" />
                  ) : (
                    <span className="size-2 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={"truncate text-small text-foreground " + (m.status === "NEW" ? "font-semibold" : "font-medium")}>
                        {m.company}
                      </span>
                      <span className="text-caption text-subtle">·</span>
                      <span className="truncate text-caption text-muted">{m.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-caption text-subtle">
                      {interestLabel(m.interest)} · {regionLabel(m.region)} · {m.message}
                    </p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-caption font-medium sm:inline-flex ${statusStyle[m.status]}`}>
                    {CONTACT_STATUS_LABEL[m.status]}
                  </span>
                  <span className="shrink-0 text-caption text-subtle">{timeAgo(m.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
