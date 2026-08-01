import { cn } from "@/lib/utils";

/**
 * SectionHeader — the reusable overline + heading + intro cluster used by every
 * homepage section. Server Component. Centralizing this guarantees identical
 * typographic rhythm and a consistent heading contract (each section's <h2>
 * carries the id its <section aria-labelledby> points to).
 */

type SectionHeaderProps = {
  /** id applied to the heading for aria-labelledby wiring. */
  headingId: string;
  overline: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeader({
  headingId,
  overline,
  title,
  intro,
  align = "left",
  className,
}: SectionHeaderProps) {
  const centered = align === "center";
  return (
    <div className={cn(centered && "mx-auto text-center", className)}>
      <p className="eyebrow text-accent">{overline}</p>
      <h2
        id={headingId}
        className="mt-4 text-balance font-sans text-h2 font-semibold text-foreground"
      >
        {title}
      </h2>
      {intro ? (
        <p
          className={cn(
            "mt-5 text-body-lg text-muted",
            centered ? "measure mx-auto" : "measure",
          )}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
}
