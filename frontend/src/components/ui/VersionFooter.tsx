"use client";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] text-slate-500 ${className || ""}`}>
      SRL v2.1.a
    </p>
  );
}
