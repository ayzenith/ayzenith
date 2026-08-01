/**
 * Route loading UI for the marketing segment. Server Component. Shown within the
 * persistent chrome while a segment streams. Pages are statically rendered, so
 * this is rarely seen — kept minimal and on-brand, with an accessible status
 * announcement and a calm motion-safe pulse (respects prefers-reduced-motion).
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60svh] items-center justify-center"
    >
      <span className="sr-only">Loading…</span>
      <span
        aria-hidden="true"
        className="eyebrow text-subtle motion-safe:animate-pulse"
      >
        AYZENITH
      </span>
    </div>
  );
}
