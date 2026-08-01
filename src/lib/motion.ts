import type { Variants, Transition } from "framer-motion";

/**
 * Shared motion language — the physics of the brand (Motion Philosophy).
 * Weighted, unhurried, ascending. No bounce, no overshoot. These plain objects
 * are tree-shakeable and imported only by the few Client Components that
 * genuinely animate, so no motion cost is paid by static content.
 */

/** Confident deceleration — the default entrance curve (ease-out-quart). */
export const EASE_OUT: Transition["ease"] = [0.25, 1, 0.5, 1];

/** Content rises gently into place — a nod to the zenith motif. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.64, ease: EASE_OUT },
  },
};

/** Reveal once, when comfortably in view — never re-triggering on scroll-back. */
export const viewportOnce = { once: true, amount: 0.2, margin: "0px 0px -12% 0px" } as const;
