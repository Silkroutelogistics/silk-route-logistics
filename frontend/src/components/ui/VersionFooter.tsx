"use client";

// Major version history:
// v2.0 — AE console merge
// v2.5 — Design system overhaul
// v3.0 — Light mode default, warm stone palette
// v3.1 — Login fix, distance calc, card readability

export const SRL_VERSION = "3.1";
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION} · {BUILD}
    </p>
  );
}
