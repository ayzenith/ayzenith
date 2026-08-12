import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { listUsers } from "@/server/users";
import { PageHeader } from "@/components/admin/page-header";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { CreateUserForm } from "@/components/admin/users/create-user-form";
import { UserRowActions } from "@/components/admin/users/user-row-actions";
import type { Role } from "@prisma/client";

export const metadata: Metadata = { title: "Kullanıcılar · AYZENITH" };
export const dynamic = "force-dynamic";

const roleStyle: Record<Role, string> = {
  SUPER_ADMIN: "bg-[#efe8fb] text-[#6b3fb8]",
  ADMIN: "bg-[#e8f0fb] text-[#1f5cb8]",
  EDITOR: "bg-surface-sunken text-muted",
};

function formatDate(date: Date | null): string {
  if (!date) return "Hiç giriş yok";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function UsersPage() {
  const actor = await requireRole("SUPER_ADMIN");
  const users = await listUsers();
  const activeSuperAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.active).length;

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        description="Panele erişimi olan kişileri yönetin. Herkese açık kayıt yoktur — kullanıcıları yalnızca siz eklersiniz."
      />

      <div className="mb-6">
        <CreateUserForm />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-caption uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 font-medium">Kullanıcı</th>
                <th className="px-5 py-3 font-medium">Rol</th>
                <th className="px-5 py-3 font-medium">Son giriş</th>
                <th className="px-5 py-3 font-medium">Durum</th>
                <th className="px-5 py-3 text-right font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const isSelf = u.id === actor.id;
                const isLastSuperAdmin =
                  u.role === "SUPER_ADMIN" && u.active && activeSuperAdmins <= 1;
                const locked = isSelf || isLastSuperAdmin;
                return (
                  <tr key={u.id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium text-foreground">{u.name}</span>
                        {isSelf ? (
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-subtle">siz</span>
                        ) : null}
                      </div>
                      <span className="text-caption text-subtle">{u.email}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-caption font-medium ${roleStyle[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-caption text-muted">{formatDate(u.lastLoginAt)}</td>
                    <td className="px-5 py-3.5">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1.5 text-caption font-medium text-[#2f7a48]">
                          <span className="size-1.5 rounded-full bg-[#3f9c5a]" /> Etkin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-caption font-medium text-subtle">
                          <span className="size-1.5 rounded-full bg-subtle" /> Devre dışı
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <UserRowActions id={u.id} role={u.role} active={u.active} locked={locked} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-caption text-subtle">
        Kendi rolünüzü ya da aktifliğinizi değiştiremezsiniz; son etkin Süper Yönetici de korunur (kilitli).
      </p>
    </>
  );
}
