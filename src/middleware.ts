import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Composite middleware.
 *
 * - /admin/*  → Enterprise CMS. A fast Edge gate: any route except the login
 *   page requires a valid signed session cookie, otherwise we redirect to the
 *   login page (preserving where the user was headed). The CMS is NOT localized,
 *   so next-intl never runs here. (The authoritative role/active check happens
 *   server-side in the protected layout — this gate only proves "signed in".)
 * - /os/*     → Business OS. Same gate, same cookie, same login page. It is a
 *   separate application surface with its own shell and navigation, but it
 *   deliberately shares ONE authentication system: a second sign-in flow would
 *   be a second thing to get wrong.
 * - everything else → next-intl locale handling (default locale at the root,
 *   /tr and /de prefixed).
 */

const intlMiddleware = createMiddleware(routing);

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isOs = pathname === "/os" || pathname.startsWith("/os/");

  if (isAdmin || isOs) {
    if (pathname === "/admin/login") return NextResponse.next();

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await verifySession(token);
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.search = "";
      if (pathname !== "/admin") loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Match the admin app and Business OS plus all public pages; exclude the API,
  // Next internals, the extensionless metadata route, and any file with an
  // extension. `os` is in the negative lookahead for the same reason `admin` is:
  // neither is localized, so next-intl must never rewrite those paths.
  matcher: [
    "/admin/:path*",
    "/os/:path*",
    "/((?!api|_next|_vercel|admin|os|opengraph-image|.*\\..*).*)",
  ],
};
