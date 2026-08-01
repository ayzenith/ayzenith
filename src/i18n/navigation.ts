import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation APIs. Use THESE instead of next/link and
 * next/navigation throughout the app so links, redirects and the pathname all
 * respect the active locale (and omit the prefix for the default locale).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
