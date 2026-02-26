"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#0f172a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ textAlign: "center", maxWidth: "28rem" }}>
            <div style={{
              width: "4rem", height: "4rem", margin: "0 auto 1.5rem",
              borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.5rem",
            }}>
              !
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Something went wrong
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              An unexpected error occurred. This has been logged and our team will look into it.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{
                  padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600,
                  backgroundColor: "#C8963E", color: "#0f172a", border: "none",
                  borderRadius: "0.5rem", cursor: "pointer",
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  padding: "0.625rem 1.25rem", fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0.5rem", textDecoration: "none",
                  display: "inline-flex", alignItems: "center",
                }}
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
