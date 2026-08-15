/**
 * BrandLoader — the AYZENITH mark, turning, while real work happens.
 *
 * RADAR and Lead Finder both make the user wait 15–60 seconds on live public
 * sources, and a generic grey spinner says nothing during that time. This puts
 * the brand's own geometry there instead: the triangle of the AYZ monogram
 * rotating inside the globe motif the marketing hero already uses, so the
 * waiting screen reads as AYZENITH rather than as a stalled page.
 *
 * Isomorphic — pure inline SVG and CSS, no hooks, no client boundary, a few
 * hundred bytes. Works in Server and Client trees alike.
 *
 * Speeds are deliberate. The hero's rings turn once every 45–60 seconds because
 * they are wallpaper; a loader that slow reads as frozen. These turn in seconds,
 * fast enough to signal "working" and slow enough to stay calm rather than
 * frantic — and the triangle turns AGAINST the orbit, which is what keeps it
 * feeling engineered instead of busy.
 *
 * Every animation is `motion-safe:` — under prefers-reduced-motion the mark is
 * simply still, and the accessible status text carries the meaning on its own.
 */

const NAVY = "#123252";
const GOLD = "#C9A227";

const SIZES = {
  sm: "size-8",
  md: "size-14",
  lg: "size-20",
} as const;

type BrandLoaderProps = {
  size?: keyof typeof SIZES;
  className?: string;
  /** Announced to screen readers; the visual is decorative. */
  label?: string;
};

export function BrandLoader({ size = "md", className, label = "Yükleniyor" }: BrandLoaderProps) {
  return (
    <span role="status" aria-live="polite" className={["inline-flex", className].filter(Boolean).join(" ")}>
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden="true"
        className={`${SIZES[size]} shrink-0`}
      >
        {/* Globe — the same meridian/parallel motif as the marketing hero, kept
            quiet so the triangle stays the subject. */}
        <g stroke={NAVY} strokeOpacity="0.20" strokeWidth="1">
          <circle cx="60" cy="60" r="42" />
          <ellipse cx="60" cy="60" rx="42" ry="16" />
          <ellipse cx="60" cy="60" rx="16" ry="42" />
        </g>

        {/* Orbit — dashed gold, turning one way. */}
        <g
          className="motion-safe:[animation:spin_3.6s_linear_infinite]"
          style={{ transformOrigin: "60px 60px" }}
        >
          <circle
            cx="60"
            cy="60"
            r="53"
            stroke={GOLD}
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="3 9"
            strokeLinecap="round"
          />
        </g>

        {/* The mark — AYZENITH's triangle, turning the other way. */}
        <g
          className="motion-safe:[animation:spin_6s_linear_infinite_reverse]"
          style={{ transformOrigin: "60px 60px" }}
        >
          <path
            d="M60 34 L82.5 73 L37.5 73 Z"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>

        {/* Core — the same accountable centre the hero uses. */}
        <circle cx="60" cy="60" r="3.5" fill={GOLD} />
      </svg>
    </span>
  );
}
