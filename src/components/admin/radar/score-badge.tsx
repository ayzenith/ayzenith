import { BAND, type Decision } from "./ui";

/**
 * Decision pill — colour AND text together (colour is never the only signal, per
 * the owner's requirement). Used in lists (compact) and headers (large).
 */
export function ScoreBadge({
  decision,
  score,
  size = "sm",
}: {
  decision: Decision;
  score: number | null;
  size?: "sm" | "lg";
}) {
  const band = BAND[decision];
  const big = size === "lg";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full font-semibold"
      style={{
        color: band.fg,
        backgroundColor: band.bg,
        border: `1px solid ${band.border}`,
        padding: big ? "0.4rem 0.9rem" : "0.15rem 0.6rem",
        fontSize: big ? "0.95rem" : "0.75rem",
      }}
    >
      <span aria-hidden="true">{band.dot}</span>
      {score != null ? <span className="tabular-nums">{score}</span> : null}
      <span className="uppercase tracking-wide">{band.label}</span>
    </span>
  );
}

/** Just the numeric score in a coloured chip (for tight rows). */
export function ScoreChip({ decision, score }: { decision: Decision; score: number | null }) {
  const band = BAND[decision];
  return (
    <span
      className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-small font-bold tabular-nums"
      style={{ color: band.fg, backgroundColor: band.bg, border: `1px solid ${band.border}` }}
    >
      {score != null ? score : "—"}
    </span>
  );
}
