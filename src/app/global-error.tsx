"use client";

/**
 * Global error boundary — the last line of defense. It REPLACES the root layout
 * when rendering itself fails, so it must render its own <html>/<body> and
 * cannot rely on the i18n provider or the layout's font variables. Styling is
 * inlined with brand values so it renders correctly even if the stylesheet
 * pipeline is compromised. Intentionally minimal and self-sufficient.
 */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050b14",
          color: "#f7f8fa",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "#c9a227",
            }}
          >
            AYZENITH
          </p>
          <h1
            style={{
              margin: "1.5rem 0 0",
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            An unexpected error occurred.
          </h1>
          <p style={{ margin: "1rem 0 0", color: "#7c97b5", lineHeight: 1.6 }}>
            Please try again. If the problem persists, reach us at
            partnerships@ayzenith.com.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              height: "3.25rem",
              padding: "0 2rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#c9a227",
              color: "#050b14",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
