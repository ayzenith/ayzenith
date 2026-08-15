/**
 * BrandLoader — the AYZENITH mark turning inside the globe, while real work happens.
 *
 * RADAR and Lead Finder both hold the user for 15–60 seconds against live public
 * sources, and a generic grey spinner says nothing during that time. This puts
 * the brand's own geometry there instead.
 *
 * The globe is deliberately the SAME artwork as the marketing hero, coordinate
 * for coordinate — same 400×400 space, same meridians and parallels, same tilted
 * trade-route orbit with its gold nodes, same dashed reach ring, same gold core.
 * Anyone who has seen the homepage recognises the waiting screen as the same
 * product rather than as a different app that happens to share a logo. The one
 * addition is the triangle of the AYZ monogram, turning at the centre.
 *
 * Isomorphic — pure inline SVG and CSS, no hooks, no client boundary. Works in
 * Server and Client trees alike.
 *
 * SPEED IS THE DESIGN. On the hero these rings take 45–60 seconds per revolution
 * because they are wallpaper. A loader that slow reads as a frozen page, so here
 * everything is in single-digit seconds — and the triangle turns AGAINST the
 * orbits, which is what keeps it feeling engineered rather than merely busy. The
 * globe grid itself turns slowest, so the world reads as turning under the mark
 * instead of tumbling with it.
 *
 * Every animation is `motion-safe:` — under prefers-reduced-motion the artwork is
 * simply still, and the accessible status text carries the meaning on its own.
 */

const NAVY = "#123252";
const GOLD = "#C9A227";

const SIZES = {
  sm: "size-16",
  md: "size-24",
  lg: "size-36",
} as const;

type BrandLoaderProps = {
  size?: keyof typeof SIZES;
  className?: string;
  /** Announced to screen readers; the artwork itself is decorative. */
  label?: string;
};

export function BrandLoader({ size = "lg", className, label = "Yükleniyor" }: BrandLoaderProps) {
  const origin = { transformOrigin: "200px 200px" } as const;

  return (
    <span role="status" aria-live="polite" className={["inline-flex", className].filter(Boolean).join(" ")}>
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className={`${SIZES[size]} shrink-0`}>
        {/* Globe — meridians and parallels, exactly as the hero draws them. */}
        <g
          className="motion-safe:[animation:spin_24s_linear_infinite]"
          style={origin}
          stroke={NAVY}
          strokeOpacity="0.28"
          strokeWidth="1"
        >
          <circle cx="200" cy="200" r="120" />
          <ellipse cx="200" cy="200" rx="120" ry="46" />
          <ellipse cx="200" cy="200" rx="120" ry="90" />
          <ellipse cx="200" cy="200" rx="46" ry="120" />
          <ellipse cx="200" cy="200" rx="90" ry="120" />
          <line x1="80" y1="200" x2="320" y2="200" />
          <line x1="200" y1="80" x2="200" y2="320" />
        </g>

        {/* Outer reach ring — dashed gold. */}
        <g className="motion-safe:[animation:spin_6s_linear_infinite]" style={origin}>
          <circle
            cx="200"
            cy="200"
            r="168"
            stroke={GOLD}
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="2 10"
          />
        </g>

        {/* Tilted trade-route orbit with connection nodes and links. */}
        <g className="motion-safe:[animation:spin_14s_linear_infinite_reverse]" style={origin}>
          <ellipse
            cx="200"
            cy="200"
            rx="150"
            ry="150"
            stroke={NAVY}
            strokeOpacity="0.18"
            strokeWidth="1"
            transform="rotate(-24 200 200)"
          />
          <path
            d="M200 50 L338 260 M338 260 L62 260 M62 260 L200 50"
            stroke={GOLD}
            strokeOpacity="0.35"
            strokeWidth="1"
            transform="rotate(-24 200 200)"
          />
          <g fill={GOLD} transform="rotate(-24 200 200)">
            <circle cx="200" cy="50" r="4.5" />
            <circle cx="338" cy="260" r="4.5" />
            <circle cx="62" cy="260" r="4.5" />
          </g>
        </g>

        {/* The mark — AYZENITH's triangle, turning against the orbits. */}
        <g className="motion-safe:[animation:spin_8s_linear_infinite_reverse]" style={origin}>
          <path
            d="M200 122 L267.5 239 L132.5 239 Z"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </g>

        {/* Core — the accountable centre, exactly as the hero draws it. */}
        <circle cx="200" cy="200" r="5.5" fill={GOLD} />
        <circle cx="200" cy="200" r="12" stroke={GOLD} strokeOpacity="0.5" strokeWidth="1" />
      </svg>
    </span>
  );
}
