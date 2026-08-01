/**
 * HeroComposition — a lightweight, abstract visual for the Hero's right side.
 *
 * Represents global sourcing, international trade, logistics, connected markets
 * and enterprise partnerships as an orbital / network motif: a quiet navy globe
 * of latitude–longitude arcs, tilted trade-route orbits, and gold connection
 * nodes. Pure inline SVG — a few KB, no raster, no stock imagery, no JS beyond
 * one CSS rotation that is disabled under prefers-reduced-motion.
 *
 * REPLACEABLE BY DESIGN: it occupies the hero's right column and nothing else.
 * To swap in premium CGI later, replace this element with
 * <Media assetKey="hero.composition" …/> — the layout does not change.
 */
export function HeroComposition() {
  const navy = "#123252";
  const gold = "#C9A227";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
      {/* Soft depth halo behind the artwork. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(27,64,104,0.10),transparent_72%)]"
      />

      <svg
        viewBox="0 0 400 400"
        fill="none"
        role="img"
        aria-label="Abstract representation of AYZENITH's global trade network"
        className="relative h-full w-full"
      >
        {/* Globe — meridians and parallels, quiet navy. */}
        <g stroke={navy} strokeOpacity="0.28" strokeWidth="1">
          <circle cx="200" cy="200" r="120" />
          <ellipse cx="200" cy="200" rx="120" ry="46" />
          <ellipse cx="200" cy="200" rx="120" ry="90" />
          <ellipse cx="200" cy="200" rx="46" ry="120" />
          <ellipse cx="200" cy="200" rx="90" ry="120" />
          <line x1="80" y1="200" x2="320" y2="200" />
          <line x1="200" y1="80" x2="200" y2="320" />
        </g>

        {/* Outer reach ring — dashed, slowly rotating (motion-safe). */}
        <g
          className="motion-safe:[animation:spin_90s_linear_infinite]"
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle
            cx="200"
            cy="200"
            r="168"
            stroke={gold}
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="2 10"
          />
        </g>

        {/* Tilted trade-route orbit with connection nodes and links. */}
        <g
          className="motion-safe:[animation:spin_120s_linear_infinite]"
          style={{ transformOrigin: "200px 200px" }}
        >
          <ellipse
            cx="200"
            cy="200"
            rx="150"
            ry="150"
            stroke={navy}
            strokeOpacity="0.18"
            strokeWidth="1"
            transform="rotate(-24 200 200)"
          />
          {/* Route chords between nodes. */}
          <path
            d="M200 50 L338 260 M338 260 L62 260 M62 260 L200 50"
            stroke={gold}
            strokeOpacity="0.35"
            strokeWidth="1"
            transform="rotate(-24 200 200)"
          />
          {/* Connection nodes. */}
          <g fill={gold} transform="rotate(-24 200 200)">
            <circle cx="200" cy="50" r="4.5" />
            <circle cx="338" cy="260" r="4.5" />
            <circle cx="62" cy="260" r="4.5" />
          </g>
        </g>

        {/* Core — the accountable centre. */}
        <circle cx="200" cy="200" r="5.5" fill={gold} />
        <circle cx="200" cy="200" r="12" stroke={gold} strokeOpacity="0.5" strokeWidth="1" />
      </svg>
    </div>
  );
}
