"use client";

import { useEffect, useState } from "react";

/**
 * Returns true once the page has scrolled past `threshold` pixels.
 *
 * Implemented with an IntersectionObserver watching a 1px sentinel pinned to the
 * top of the document, rather than a scroll listener. IO fires reliably
 * regardless of scroll throttling or which element is the scroll container, so
 * the sticky navbar's solid state is never missed — the robust pattern used by
 * premium apps. Client-only (DOM + observer exist only in the browser).
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // A sentinel sized to the threshold, pinned to the very top of the page.
    const sentinel = document.createElement("div");
    Object.assign(sentinel.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "1px",
      height: `${Math.max(1, threshold)}px`,
      pointerEvents: "none",
      opacity: "0",
    });
    document.body.appendChild(sentinel);

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry!.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, [threshold]);

  return scrolled;
}
