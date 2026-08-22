"use client";

/**
 * Navbar — the persistent brand signature and path to conversion (Wireframe 00).
 *
 * WHY CLIENT: two behaviors are inherently browser-side — condensing from
 * transparent-over-hero to a solid, blurred bar on scroll, and toggling the
 * mobile overlay. Everything else (links, wordmark, CTA) is plain markup and
 * real anchors, so the interactive surface — and the JS — stays minimal.
 *
 * The structure is mega-menu-ready: `primaryNav` is data-driven, so future
 * divisions and portals extend the menu without touching this component.
 */

import { useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useScrolled } from "@/hooks/use-scrolled";
import { primaryNav } from "@/config/site";
import { cn } from "@/lib/utils";

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const scrolled = useScrolled(12);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        scrolled
          ? // Fully opaque off-white — content can never read through it.
            "border-b border-border bg-offwhite shadow-sm"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <Container>
        <div
          className={cn(
            "flex items-center justify-between gap-6 transition-[height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            scrolled ? "h-[4.5rem]" : "h-24",
          )}
        >
          <Link
            href="/"
            aria-label={t("home")}
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ring)]"
          >
            {/* Decorative: the link is already labelled by nav.home. Full-colour
                brand mark (navy + gold) on the light navbar — the gold "E" reads. */}
            <Logo tone="brand" priority alt="" sizes="280px" className="h-12 md:h-14" />
          </Link>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-10">
              {primaryNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative inline-flex py-1 text-small font-medium tracking-[0.01em] transition-colors duration-300",
                        isActive ? "text-foreground" : "text-muted hover:text-foreground",
                      )}
                    >
                      {t(item.labelKey)}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 left-0 h-px w-full origin-left bg-gold-500 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
                          isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                        )}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            <LanguageSwitcher />

            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link href="/contact">{t("cta")}</Link>
            </Button>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("menu")}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              className="inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] lg:hidden"
            >
              <Menu className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Container>

      <AnimatePresence>
        {menuOpen ? (
          <MobileMenu onClose={() => setMenuOpen(false)} triggerRef={menuButtonRef} />
        ) : null}
      </AnimatePresence>
    </header>
  );
}
