import { cn } from "@/lib/utils";

/**
 * TradeNetwork — the corridor diagram that carries the export hero.
 *
 * It is a DIAGRAM OF COMMERCIAL FOCUS, not a map of premises. AYZENITH has no
 * offices, warehouses or local teams in these regions, so nothing here may read
 * as a location pin on a world map: the nodes are markets we develop, the lines
 * are trade corridors, and the legend says so in words. Drawn abstractly, on a
 * bare graticule rather than coastlines, for exactly that reason.
 *
 * The three tiers are encoded in ink, not just in labels — Europe is drawn
 * solid and gold, the Gulf thinner and quieter, Central Asia dashed and faint.
 * A visitor who reads only the picture should still come away with the right
 * ranking, because a diagram that flatters every region would over-claim just
 * as badly as the copy would.
 *
 * Inline SVG on the light hero field: no request, no decode, no layout shift.
 * Server Component.
 */

const HAIR = "rgba(18,50,82,0.09)";
const LINE = "rgba(18,50,82,0.20)";
const LINE_STRONG = "rgba(18,50,82,0.38)";
const GOLD = "#C9A227";
const GOLD_SOFT = "rgba(201,162,39,0.42)";
const NAVY = "#123252";

type Labels = {
  /** Accessible description of the whole diagram. */
  caption: string;
  origin: string;
  europe: string;
  gulf: string;
  centralAsia: string;
};

/** Europe — four corridors, drawn at full strength. */
const EUROPE_NODES = [
  [126, 118],
  [188, 84],
  [104, 186],
  [196, 162],
] as const;

/** The Gulf — being built, so two corridors at reduced weight. */
const GULF_NODES = [
  [402, 344],
  [452, 398],
] as const;

/** Central Asia — under evaluation only: dashed, small, quiet. */
const CENTRAL_ASIA_NODES = [
  [430, 112],
  [472, 158],
  [506, 214],
] as const;

const ORIGIN = [272, 252] as const;

export function TradeNetwork({
  labels,
  className,
}: {
  labels: Labels;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 560 470"
      className={cn("h-auto w-full", className)}
      fill="none"
      role="img"
      aria-label={labels.caption}
    >
      {/* Graticule — enough geometry to read as geography, no coastlines. */}
      <g>
        {[70, 130, 190, 250, 310, 370, 430].map((y) => (
          <path key={`lat-${y}`} d={`M40 ${y}h480`} stroke={HAIR} strokeWidth="1" />
        ))}
        {[80, 160, 240, 320, 400, 480].map((x) => (
          <path key={`lon-${x}`} d={`M${x} 50v370`} stroke={HAIR} strokeWidth="1" />
        ))}
        <ellipse cx="280" cy="235" rx="238" ry="188" stroke={HAIR} strokeWidth="1" />
      </g>

      {/* Central Asia — evaluated, not worked. Dashed, thin, low contrast. */}
      <g>
        {CENTRAL_ASIA_NODES.map(([x, y]) => (
          <path
            key={`ca-${x}`}
            d={`M${ORIGIN[0]} ${ORIGIN[1]}Q${(ORIGIN[0] + x) / 2} ${y - 46} ${x} ${y}`}
            stroke={LINE}
            strokeWidth="1"
            strokeDasharray="3 6"
          />
        ))}
        {CENTRAL_ASIA_NODES.map(([x, y]) => (
          <circle key={`can-${x}`} cx={x} cy={y} r="3.5" stroke={LINE} strokeWidth="1" />
        ))}
      </g>

      {/* The Gulf — active build-out. Solid, but quieter than Europe. */}
      <g>
        {GULF_NODES.map(([x, y]) => (
          <path
            key={`g-${x}`}
            d={`M${ORIGIN[0]} ${ORIGIN[1]}Q${(ORIGIN[0] + x) / 2 + 26} ${(ORIGIN[1] + y) / 2 - 14} ${x} ${y}`}
            stroke={GOLD_SOFT}
            strokeWidth="1.25"
          />
        ))}
        {GULF_NODES.map(([x, y]) => (
          <circle key={`gn-${x}`} cx={x} cy={y} r="5" stroke={GOLD_SOFT} strokeWidth="1.5" />
        ))}
      </g>

      {/* Europe — the core market. Heaviest line, filled nodes, full gold. */}
      <g>
        {EUROPE_NODES.map(([x, y]) => (
          <path
            key={`e-${x}`}
            d={`M${ORIGIN[0]} ${ORIGIN[1]}Q${(ORIGIN[0] + x) / 2 - 18} ${(ORIGIN[1] + y) / 2 - 34} ${x} ${y}`}
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ))}
        {EUROPE_NODES.map(([x, y]) => (
          <g key={`en-${x}`}>
            <circle cx={x} cy={y} r="9" stroke={GOLD} strokeWidth="1" opacity="0.4" />
            <circle cx={x} cy={y} r="4.5" fill={GOLD} />
          </g>
        ))}
      </g>

      {/* Istanbul — where the corridors are run from. */}
      <g>
        <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r="26" stroke={LINE} strokeWidth="1" />
        <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r="15" stroke={LINE_STRONG} strokeWidth="1.25" />
        <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r="6" fill={NAVY} />
      </g>

    </svg>
  );
}

/**
 * The regions, named. Deliberately HTML rather than <text> inside the diagram:
 * SVG text scales with the viewBox, so labels legible on a desktop column
 * collapsed to about six pixels once the drawing shrank to phone width. Out
 * here they keep the page's real type scale at every size, stay selectable, and
 * reuse the same tier marks as the market board further down the page.
 */
const legendRule: Record<"core" | "growth" | "emerging", string> = {
  core: "h-0.5 w-8 bg-gold-500",
  growth: "h-px w-6 bg-gold-500/55",
  emerging: "h-0 w-5 border-t border-dashed border-border-strong",
};

export function TradeNetworkLegend({
  labels,
  className,
}: {
  labels: Pick<Labels, "origin" | "europe" | "gulf" | "centralAsia">;
  className?: string;
}) {
  const rows = [
    { key: "core", label: labels.europe, tone: "text-foreground" },
    { key: "growth", label: labels.gulf, tone: "text-muted" },
    { key: "emerging", label: labels.centralAsia, tone: "text-subtle" },
  ] as const;

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      <li className="flex items-center gap-2.5">
        <span aria-hidden="true" className="size-[7px] rounded-full bg-navy-800" />
        <span className="eyebrow text-foreground">{labels.origin}</span>
      </li>
      {rows.map(({ key, label, tone }) => (
        <li key={key} className="flex items-center gap-2.5">
          <span aria-hidden="true" className={legendRule[key]} />
          <span className={cn("eyebrow", tone)}>{label}</span>
        </li>
      ))}
    </ul>
  );
}
