/**
 * Media graphics — the inline SVG figures a registry slot can render instead of
 * a bare placeholder surface.
 *
 * WHY INLINE: these ship as markup inside the already-streamed HTML, so a slot
 * gains a real figure at zero network cost — no request, no decode, no layout
 * shift, and nothing to lazy-load. They sit on the same navy ground as
 * MediaPlaceholder, so a slot can move placeholder → graphic → photography
 * without any layout change.
 *
 * DRAWING RULES (Design Manual): thin precision linework on navy, one restrained
 * gold emphasis per figure, no fills that compete with the foreground text.
 * Colours are literal because the ground is navy in both themes — the surface
 * never inverts, so a token that flips would break contrast here.
 *
 * Server Component; no client JS.
 */

const LINE = "rgba(180,196,214,0.38)";
const LINE_SOFT = "rgba(180,196,214,0.18)";
const GOLD = "#C9A227";

export type GraphicKey =
  | "globeNetwork"
  | "routeFlow"
  | "labelMark"
  | "interlock";

/** Shared canvas: matches the 3:2 `wide` aspect the service blocks use. */
function Figure({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 600 400"
      className="absolute inset-0 size-full"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Global sourcing — a meridian globe with live supplier nodes and one trade arc. */
function GlobeNetwork() {
  return (
    <Figure>
      <circle cx="300" cy="200" r="118" stroke={LINE} strokeWidth="1.25" />
      <circle cx="300" cy="200" r="118" stroke={LINE_SOFT} strokeWidth="18" />
      {/* Latitudes */}
      <ellipse cx="300" cy="200" rx="118" ry="40" stroke={LINE_SOFT} strokeWidth="1" />
      <ellipse cx="300" cy="200" rx="118" ry="82" stroke={LINE_SOFT} strokeWidth="1" />
      <path d="M195 145h210M195 255h210" stroke={LINE_SOFT} strokeWidth="1" />
      {/* Meridians */}
      <ellipse cx="300" cy="200" rx="40" ry="118" stroke={LINE_SOFT} strokeWidth="1" />
      <ellipse cx="300" cy="200" rx="82" ry="118" stroke={LINE_SOFT} strokeWidth="1" />
      <path d="M300 82v236" stroke={LINE_SOFT} strokeWidth="1" />
      {/* Trade arc between two sourcing points */}
      <path
        d="M232 128c58-42 130-30 168 22"
        stroke={GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="232" cy="128" r="4.5" fill={GOLD} />
      <circle cx="400" cy="150" r="4.5" fill={GOLD} />
      {/* Approved suppliers already on the network */}
      <circle cx="266" cy="252" r="3" fill={LINE} />
      <circle cx="344" cy="236" r="3" fill={LINE} />
      <circle cx="308" cy="290" r="3" fill={LINE} />
    </Figure>
  );
}

/** Distribution — origin, tracked waypoints, destination; goods staged below. */
function RouteFlow() {
  return (
    <Figure>
      {/* The lane */}
      <path d="M86 158h428" stroke={LINE_SOFT} strokeWidth="1" />
      <path
        d="M86 158c96 0 96-56 192-56s96 56 192 56"
        stroke={LINE}
        strokeWidth="1.25"
      />
      {/* Completed leg */}
      <path
        d="M86 158c96 0 96-56 192-56"
        stroke={GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="86" cy="158" r="5" fill={GOLD} />
      <circle cx="278" cy="102" r="5" fill={GOLD} />
      <circle cx="470" cy="158" r="4.5" stroke={LINE} strokeWidth="1.5" />
      {/* Staged units — full, full, in transit */}
      <rect x="118" y="230" width="96" height="66" rx="4" stroke={LINE} strokeWidth="1.25" />
      <path d="M118 252h96" stroke={LINE_SOFT} strokeWidth="1" />
      <rect x="252" y="230" width="96" height="66" rx="4" stroke={LINE} strokeWidth="1.25" />
      <path d="M252 252h96" stroke={LINE_SOFT} strokeWidth="1" />
      <rect x="386" y="230" width="96" height="66" rx="4" stroke={LINE_SOFT} strokeWidth="1.25" strokeDasharray="5 5" />
      <path d="M150 230v-40M284 230v-40M418 230v-40" stroke={LINE_SOFT} strokeWidth="1" />
    </Figure>
  );
}

/** Private label — a spec sheet resolving into an owned mark on the package. */
function LabelMark() {
  return (
    <Figure>
      {/* Specification, controlled upstream */}
      <rect x="96" y="112" width="150" height="188" rx="6" stroke={LINE_SOFT} strokeWidth="1.25" />
      <path
        d="M124 152h94M124 178h94M124 204h66M124 230h80M124 256h50"
        stroke={LINE_SOFT}
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Carry-over */}
      <path d="M262 206h58" stroke={LINE} strokeWidth="1.25" strokeDasharray="4 6" />
      {/* The package that now carries your mark */}
      <rect x="336" y="112" width="168" height="188" rx="6" stroke={LINE} strokeWidth="1.5" />
      <path d="M336 158h168" stroke={LINE_SOFT} strokeWidth="1" />
      <circle cx="420" cy="212" r="34" stroke={GOLD} strokeWidth="1.5" />
      <circle cx="420" cy="212" r="18" stroke={GOLD} strokeWidth="1.5" />
      <circle cx="420" cy="212" r="5" fill={GOLD} />
      <path d="M372 268h96" stroke={LINE_SOFT} strokeWidth="1" strokeLinecap="round" />
    </Figure>
  );
}

/** Manufacturing partnerships — two structures interlocking into one capability. */
function Interlock() {
  return (
    <Figure>
      {/* Partner plant */}
      <path
        d="M108 288V186l52-34 52 34v102"
        stroke={LINE}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M134 288v-52h52v52" stroke={LINE_SOFT} strokeWidth="1" />
      {/* Our side */}
      <path
        d="M388 288V186l52-34 52 34v102"
        stroke={LINE}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M414 288v-52h52v52" stroke={LINE_SOFT} strokeWidth="1" />
      {/* Shared floor */}
      <path d="M76 288h448" stroke={LINE_SOFT} strokeWidth="1" />
      {/* The interlock itself */}
      <circle cx="278" cy="200" r="42" stroke={GOLD} strokeWidth="1.5" />
      <circle cx="322" cy="200" r="42" stroke={GOLD} strokeWidth="1.5" />
      <path d="M212 200h24M364 200h24" stroke={LINE} strokeWidth="1.25" />
    </Figure>
  );
}

const graphics: Record<GraphicKey, () => React.ReactElement> = {
  globeNetwork: GlobeNetwork,
  routeFlow: RouteFlow,
  labelMark: LabelMark,
  interlock: Interlock,
};

export function MediaGraphic({ figure }: { figure: GraphicKey }) {
  const Graphic = graphics[figure];
  return <Graphic />;
}
