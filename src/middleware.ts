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
 * - everything else → next-intl locale handling (default locale at the root,
 *   /tr and /de prefixed).
 */

const intlMiddleware = createMiddleware(routing);

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
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
  // Match the admin app plus all public pages; exclude the API, Next internals,
  // the extensionless metadata route, and any file with an extension.
  matcher: [
    "/admin/:path*",
    "/((?!api|_next|_vercel|admin|opengraph-image|.*\\..*).*)",
  ],
};
