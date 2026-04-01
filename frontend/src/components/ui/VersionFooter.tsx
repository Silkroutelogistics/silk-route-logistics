"use client";
const version = "2.1";
const build = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] text-slate-500 ${className || ""}`}>
      SRL v{version} · Build {build}
    </p>
  );
}
