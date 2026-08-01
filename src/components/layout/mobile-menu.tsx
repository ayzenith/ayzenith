"use client";

/**
 * MobileMenu — full-screen navigation overlay for small viewports.
 *
 * WHY CLIENT: it is a modal dialog. It manages open/close animation, Escape to
 * dismiss, focus movement into and out of the panel, and body-scroll locking —
 * all inherently interactive, browser-only behaviors. Rendered only when open,
 * so it adds nothing to the initial payload of a first paint.
 *
 * Accessibility: role="dialog" + aria-modal, labelled close control, Escape to
 * close, focus sent to the panel on open and restored to the trigger on close,
 * and background scroll locked. Meets WCAG 2.2 for modal interaction.
 */

import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { primaryNav } from "@/config/site";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MobileMenuProps = {
  onClose: () => void;
  /** The element to return focus to when the menu closes. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function MobileMenu({ onClose, triggerRef }: MobileMenuProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useLockBodyScroll(true);

  useEffect(() => {
    const previouslyFocused = triggerRef.current;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap — keep Tab within the dialog (WCAG 2.4.3 / 2.1.2).
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;

        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;

        if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, triggerRef]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t("home")}
      ref={panelRef}
      tabIndex={-1}
      data-theme="dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      className="fixed inset-0 z-[70] flex flex-col bg-navy-950/95 backdrop-blur-md md:hidden"
    >
      <div className="flex h-20 items-center justify-between px-6">
        <Logo tone="light" alt="" sizes="200px" className="h-10" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col justify-center px-6">
        <ul className="flex flex-col gap-2">
          {primaryNav.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.li
                key={item.href}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + index * 0.06, duration: 0.4, ease: EASE_OUT }}
              >
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between border-b border-border py-5 font-serif text-h4 transition-colors",
                    isActive ? "text-accent" : "text-foreground hover:text-accent",
                  )}
                >
                  {t(item.labelKey)}
                  {isActive ? (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                  ) : null}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </nav>

      <div className="px-6 pb-12">
        <Button asChild size="lg" className="w-full">
          <Link href="/contact" onClick={onClose}>
            {t("cta")}
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
