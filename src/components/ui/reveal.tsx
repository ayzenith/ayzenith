"use client";

/**
 * Reveal — the one shared scroll-entrance wrapper.
 *
 * WHY CLIENT: scroll-triggered animation requires an IntersectionObserver and
 * the browser's motion-preference API — neither exists on the server. It is the
 * single, tiny animation primitive the homepage reuses, so the Framer Motion
 * cost is paid once and shared, never duplicated per section.
 *
 * Accessibility: when the user prefers reduced motion, content renders
 * immediately with no transform — full information, zero vestibular risk.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { fadeRise, viewportOnce } from "@/lib/motion";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Seconds of delay for choreographed sequences. */
  delay?: number;
  /** Override the default fade-rise variant. */
  variants?: Variants;
  /** Render as a stagger container that orchestrates Reveal children. */
  as?: "div" | "li" | "span";
};

export function Reveal({
  children,
  className,
  delay = 0,
  variants = fadeRise,
  as = "div",
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const MotionTag = motion[as];

  if (prefersReducedMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  // Merge the choreography delay INTO the visible variant so the variant's own
  // duration and easing are preserved (a bare `transition` prop would replace
  // them). This keeps staggered sequences on the brand's motion curve.
  const visible = variants.visible as { transition?: object } | undefined;
  const activeVariants = (
    delay
      ? {
          ...variants,
          visible: {
            ...(visible ?? {}),
            transition: { ...(visible?.transition ?? {}), delay },
          },
        }
      : variants
  ) as Variants;

  return (
    <MotionTag
      className={cn(className)}
      variants={activeVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      {children}
    </MotionTag>
  );
}
