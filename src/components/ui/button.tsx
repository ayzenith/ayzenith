import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — the system's single action primitive (shadcn/ui pattern).
 *
 * Server Component: it renders markup and composes classes; it holds no state.
 * When wrapping a link, pass `asChild` and provide a <Link> child, so the
 * anchor stays a real, crawlable, accessible element (SEO + a11y) with no extra
 * JavaScript. On the dark brand surface the primary action is gold — the
 * scarce, precious signal reserved for conversion (Design Manual, Law 2).
 */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-semibold",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:size-[1.1em] [&_svg]:shrink-0",
    "motion-safe:hover:-translate-y-px active:translate-y-0",
  ],
  {
    variants: {
      variant: {
        // Gold on every surface — the AYZENITH action colour is consistent
        // site-wide (navy text keeps ≥7:1 on gold). Not tied to the theme accent.
        primary:
          "bg-gold-500 text-navy-950 hover:bg-gold-600 motion-safe:hover:shadow-gold-glow",
        secondary:
          "border border-foreground/25 text-foreground hover:border-accent hover:text-accent",
        ghost: "text-foreground hover:text-accent",
        subtle:
          "bg-surface-raised text-foreground border border-border hover:border-border-strong",
      },
      size: {
        sm: "h-9 px-4 text-[0.875rem]",
        md: "h-11 px-6 text-[1rem]",
        lg: "h-[3.25rem] px-8 text-[1.0625rem]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      // A native <button> defaults to type="submit"; make intent explicit.
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
