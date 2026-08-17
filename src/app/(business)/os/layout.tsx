import { requireUser } from "@/server/auth";
import { OsShell } from "@/components/os/os-shell";

/**
 * Protected Business OS layout.
 *
 * The Edge middleware has already checked that a signed session cookie exists.
 * `requireUser` is the authoritative check: it re-reads the user from the
 * database on every request, so a deactivated account loses access here even
 * while holding a cryptographically valid cookie. Identical to the CMS — one
 * authentication system, two products.
 */
export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <OsShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </OsShell>
  );
}
