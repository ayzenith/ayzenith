import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Locale middleware — detects the locale from the URL (and persists the user's
 * choice via a cookie), rewriting the default locale to the root. Runs on all
 * pages; static assets, the API and Next internals are excluded by the matcher.
 */
export default createMiddleware(routing);

export const config = {
  // Match all pathnames except: api routes, Next internals, the extensionless
  // metadata route (opengraph-image), and files with an extension.
  matcher: ["/((?!api|_next|_vercel|opengraph-image|.*\\..*).*)"],
};
