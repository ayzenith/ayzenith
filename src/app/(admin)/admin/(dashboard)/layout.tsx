import { requireUser } from "@/server/auth";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Protected CMS layout. `requireUser` re-validates the session against the
 * database on every request (deactivated/deleted users are ejected here even if
 * their cookie is still valid), then renders the app shell around the page.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {children}
    </AdminShell>
  );
}
