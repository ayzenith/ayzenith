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
 * - /doc/*    → Trade document print/preview view. NOT gated here with a
 *   redirect-to-login: it authorizes itself (session cookie OR a short-lived
 *   document-scoped token — see src/server/os/document-token.ts) because the
 *   PDF pipeline's headless Chromium requests it with a token and no cookie.
 *   It only needs to be excluded from next-intl, the same as /admin and /os.
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
  const isDoc = pathname === "/doc" || pathname.startsWith("/doc/");

  if (isDoc) return NextResponse.next();

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
  // Match the admin app, Business OS and the trade-document print view, plus
  // all public pages; exclude the API, Next internals, the extensionless
  // metadata route, and any file with an extension. `admin`/`os`/`doc` are all
  // in the negative lookahead for the same reason: none of them are localized,
  // so next-intl must never rewrite those paths.
  matcher: [
    "/admin/:path*",
    "/os/:path*",
    "/doc/:path*",
    "/((?!api|_next|_vercel|admin|os|doc|opengraph-image|.*\\..*).*)",
  ],
};
