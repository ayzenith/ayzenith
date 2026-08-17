import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent, formatQty, formatDate } from "@/config/os";

/**
 * Business OS shared surface.
 *
 * These are Server Components on purpose. Almost every screen in this module is
 * a table of numbers rendered from a database read, and shipping a client bundle
 * to draw a table would trade the one thing the owner will feel every day — how
 * fast a page appears — for nothing.
 *
 * Numbers get `tabular-nums` and right alignment everywhere, so a column of
 * money can be scanned down rather than read across.
 */

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function PageHead({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-7">
      {back ? (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-caption font-medium text-subtle transition-colors hover:text-foreground"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-sans text-h4 font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-small text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-small font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-caption text-subtle">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  href?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-success",
    negative: "text-error",
    warning: "text-warning",
  }[tone];
  const body = (
    <>
      <p className="text-caption font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className={cn("mt-2 font-sans text-h5 font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-caption text-subtle">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-border bg-surface p-4">{body}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-small font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-md text-small text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export type Align = "left" | "right" | "center";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  // Wide financial tables scroll inside their own container; the page body must
  // never scroll sideways.
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-small">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-border px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-subtle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  numeric,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: Align;
  className?: string;
  numeric?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-border/60 px-4 py-3 align-middle text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-surface-sunken/60", className)}>{children}</tr>;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export function Money({
  value,
  currency,
  tone,
  className,
}: {
  value: number | null | undefined;
  currency?: string;
  tone?: "auto" | "muted" | "none";
  className?: string;
}) {
  const t = tone ?? "none";
  const color =
    t === "auto"
      ? value == null || value === 0
        ? "text-muted"
        : value > 0
          ? "text-success"
          : "text-error"
      : t === "muted"
        ? "text-muted"
        : undefined;
  return <span className={cn("tabular-nums", color, className)}>{formatMoney(value, currency)}</span>;
}

export function Qty({ value, unit }: { value: number | null | undefined; unit?: string | null }) {
  return <span className="tabular-nums">{formatQty(value, unit)}</span>;
}

export function Pct({ value }: { value: number | null | undefined }) {
  return <span className="tabular-nums">{formatPercent(value)}</span>;
}

export function DateText({ value }: { value: Date | string | null | undefined }) {
  return <span className="tabular-nums text-muted">{formatDate(value)}</span>;
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-sunken text-muted ring-border",
    success: "bg-success/10 text-success ring-success/25",
    warning: "bg-warning/10 text-warning ring-warning/25",
    danger: "bg-error/10 text-error ring-error/25",
    info: "bg-info/10 text-info ring-info/25",
    accent: "bg-accent/12 text-gold-700 ring-accent/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Document status → colour. Cancelled reads muted, not red: it is a decision,
 *  not a failure. Overdue money is what gets the alarm colour in this system. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    DRAFT: { tone: "neutral", label: "Taslak" },
    CONFIRMED: { tone: "info", label: "Onaylı" },
    COMPLETED: { tone: "success", label: "Tamamlandı" },
    CANCELLED: { tone: "neutral", label: "İptal" },
    PENDING: { tone: "warning", label: "Bekliyor" },
    PARTIAL: { tone: "info", label: "Kısmi" },
    PAID: { tone: "success", label: "Ödendi" },
    PLANNED: { tone: "neutral", label: "Planlandı" },
    DUE: { tone: "warning", label: "Vadesi geldi" },
    ACTIVE: { tone: "success", label: "Aktif" },
    PROSPECT: { tone: "info", label: "Görüşülüyor" },
    PAUSED: { tone: "warning", label: "Duraklatıldı" },
    ENDED: { tone: "neutral", label: "Sona erdi" },
  };
  const meta = map[status] ?? { tone: "neutral" as BadgeTone, label: status };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy-950 px-3.5 py-2 text-small font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-small font-medium text-foreground transition-colors hover:bg-surface-sunken disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-small font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground",
  danger:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-error/30 bg-surface px-3.5 py-2 text-small font-medium text-error transition-colors hover:bg-error/5 disabled:opacity-50",
} as const;

export const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-small text-foreground outline-none transition-colors placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-ring/30";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-caption font-medium text-muted">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-caption text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  baseHref,
}: {
  page: number;
  perPage: number;
  total: number;
  baseHref: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const sep = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-caption text-muted">
      <span className="tabular-nums">
        {from}–{to} / {total} kayıt
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          {page > 1 ? (
            <Link href={`${baseHref}${sep}page=${page - 1}`} className={btn.ghost}>
              ← Önceki
            </Link>
          ) : null}
          <span className="px-2 tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`${baseHref}${sep}page=${page + 1}`} className={btn.ghost}>
              Sonraki →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Filter bar. A plain GET form, so every filtered view is a shareable URL and
 *  the back button behaves the way the browser promises. */
export function FilterBar({
  action,
  children,
  right,
}: {
  action: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form action={action} method="get" className="flex flex-wrap items-end gap-2">
        {children}
        <button type="submit" className={btn.secondary}>
          Filtrele
        </button>
      </form>
      {right ? <div className="flex flex-wrap gap-2">{right}</div> : null}
    </div>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: Array<{ label: string; href: string; count?: number }>;
  current: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {items.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2 text-small font-medium transition-colors",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 tabular-nums text-subtle">{t.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

/** A short label/value stack, used all over the detail screens. */
export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-subtle">{label}</span>
      <span className="text-small text-foreground">{children}</span>
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-caption",
        tone === "warning"
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-border bg-surface-sunken text-muted",
      )}
    >
      {children}
    </p>
  );
}
