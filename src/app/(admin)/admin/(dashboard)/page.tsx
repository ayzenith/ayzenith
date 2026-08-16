import type { Metadata } from "next";
import Link from "next/link";
import { Users2, Activity, ShieldCheck, CheckCircle2, Clock, Package, Plus, Inbox } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDashboardStats } from "@/server/dashboard";
import { recentActivity } from "@/server/activity";
import { navGroups } from "@/components/admin/nav";
import { PageHeader } from "@/components/admin/page-header";
import { ROLE_LABEL } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Panel · AYZENITH" };

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "az önce";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users2;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-caption font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-3 font-sans text-h2 font-semibold text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-caption text-subtle">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const [user, stats, activity] = await Promise.all([
    requireUser(),
    getDashboardStats(),
    recentActivity(6),
  ]);

  const modules = navGroups
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/admin");

  return (
    <>
      <PageHeader
        title={`Hoş geldin, ${firstName(user.name)}`}
        description="AYZENITH kontrol merkezin. Modüller adım adım devreye giriyor — burada gördüğün her şey canlı ve veritabanına bağlı."
      />

      {/* Live metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Package}
          label="Ürünler"
          value={stats.products}
          hint={`${stats.productsPublished} tanesi yayında`}
        />
        <StatCard
          icon={Inbox}
          label="Mesajlar"
          value={stats.messages}
          hint={stats.messagesUnread > 0 ? `${stats.messagesUnread} okunmamış` : "Tümü okundu"}
        />
        <StatCard
          icon={Users2}
          label="Ekip üyeleri"
          value={stats.users}
          hint="Panele erişimi olan kişiler"
        />
        <StatCard
          icon={Activity}
          label="İşlem kaydı"
          value={stats.activityEvents}
          hint="Kaydedilen denetim işlemleri"
        />
        <StatCard
          icon={ShieldCheck}
          label="Yetki düzeyin"
          value={ROLE_LABEL[user.role]}
          hint="Neleri yönetebileceğini belirler"
        />
      </div>

      {/* Quick actions */}
      <div className="mt-4">
        <Link
          href="/admin/products/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-small font-medium text-foreground transition-colors hover:border-accent/50"
        >
          <Plus className="size-4" aria-hidden="true" /> Yeni ürün ekle
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Module roadmap */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h6 font-semibold text-foreground">Modüller</h2>
          <p className="mt-1 text-caption text-subtle">
            Şu an aktif olanlar ve sıradakiler.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {modules.map((item) => {
              const Icon = item.icon;
              const live = item.status === "live";
              return (
                <li
                  key={item.href}
                  className="flex items-center gap-3 py-2.5"
                >
                  <Icon className="size-4 text-subtle" aria-hidden="true" />
                  <span className="flex-1 text-small text-foreground">
                    {item.label}
                  </span>
                  {live ? (
                    <span className="inline-flex items-center gap-1 text-caption font-medium text-[#3f9c5a]">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-caption font-medium text-subtle">
                      <Clock className="size-3.5" aria-hidden="true" />
                      Planlanan
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h6 font-semibold text-foreground">
            Son işlemler
          </h2>
          <p className="mt-1 text-caption text-subtle">
            Panelindeki en son kaydedilen işlemler.
          </p>
          {activity.length === 0 ? (
            <p className="mt-6 text-small text-subtle">Henüz işlem yok.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {activity.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-foreground">
                      {event.summary ?? event.action}
                    </p>
                    <p className="text-caption text-subtle">
                      {event.user?.name ?? "Sistem"} · {timeAgo(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
