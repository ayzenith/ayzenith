"use client";

/**
 * LanguageSwitcher — the premium, minimal locale selector in the navigation.
 *
 * WHY CLIENT: it opens a menu and navigates to the same page in another locale.
 * Uses the locale-aware router so the current path is preserved across the
 * switch (e.g. /services → /tr/services), and next-intl persists the choice via
 * cookie. Theme-adaptive (semantic tokens) so it reads correctly on the light
 * navbar and the dark mobile menu alike. Fully keyboard-operable.
 */

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Check, ChevronDown, Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, localeNames, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const active = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function switchTo(next: Locale) {
    setOpen(false);
    if (next !== active) {
      router.replace(pathname, { locale: next });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${localeNames[active].label}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-small font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      >
        <Globe className="size-4" aria-hidden="true" strokeWidth={1.5} />
        <span className="tabular-nums">{localeNames[active].short}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 z-50 mt-2 min-w-[9.5rem] overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {routing.locales.map((locale) => {
            const selected = locale === active;
            return (
              <li key={locale} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => switchTo(locale)}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 px-4 py-2.5 text-small transition-colors",
                    selected
                      ? "text-foreground"
                      : "text-muted hover:bg-surface-sunken hover:text-foreground",
                  )}
                >
                  {localeNames[locale].label}
                  {selected ? (
                    <Check className="size-4 text-accent" aria-hidden="true" strokeWidth={2} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
