"use client";

// Version: MAJOR.MINOR.letter (a-z, then bump minor)
// v3.0 — Light mode default, warm stone palette
// v3.1 — Login redesign, mobile responsiveness, design system tokens
// v3.2 — Gmail reply tracking, Lead Hunter DB-persist, full system audit, Compass 25-check wiring
// v3.2.a — Current release

export const SRL_VERSION = "3.2.a";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
