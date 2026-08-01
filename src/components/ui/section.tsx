import { cn } from "@/lib/utils";

/**
 * Semantic <section> with governed vertical rhythm, an accessible label, and a
 * self-contained THEME context. Server Component.
 *
 * `tone` sets both the background and the data-theme, so a section carries its
 * own light/navy semantics — this is what drives the alternating light ↔ navy
 * rhythm across the page. Content inside never needs to know the surface: it
 * uses semantic tokens (text-foreground, text-accent, border-border …) which
 * resolve correctly for whichever tone wraps them.
 */

type Tone = "plain" | "white" | "gray" | "navy";

const toneConfig: Record<
  Tone,
  { theme?: "light" | "dark"; className: string }
> = {
  plain: { className: "" },
  white: { theme: "light", className: "bg-surface" },
  gray: { theme: "light", className: "bg-surface-sunken" },
  navy: {
    theme: "dark",
    className:
      "bg-navy-950 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(27,64,104,0.35),transparent_70%)]",
  },
};

type SectionProps = {
  id?: string;
  labelledBy?: string;
  size?: "default" | "lg";
  /** Surface tone — sets background + theme context. */
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
};

export function Section({
  id,
  labelledBy,
  size = "default",
  tone = "plain",
  className,
  children,
}: SectionProps) {
  const config = toneConfig[tone];
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-theme={config.theme}
      className={cn(
        "relative scroll-mt-24",
        size === "lg" ? "section-y-lg" : "section-y",
        config.className,
        className,
      )}
    >
      {children}
    </section>
  );
}
