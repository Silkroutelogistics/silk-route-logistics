"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

/**
 * carrier-portal-upgrade M1/M5 — how a locked control looks.
 *
 * A lock, the words "Available soon", and the reason. The reason opens on
 * hover, on keyboard focus AND on tap, because a carrier on a phone has no
 * hover (M5 touch parity). The control is a real button so it is reachable by
 * keyboard, but it is aria-disabled and does nothing else: no request leaves
 * the page from a locked feature.
 */
export function LockedFeature({ label, reason, className = "" }: { label?: string; reason: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-disabled="true"
        aria-label={`${label ? `${label}: ` : ""}Available soon. ${reason}`}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-[#5B6B7D] cursor-not-allowed transition-colors duration-150 motion-reduce:transition-none hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] focus-visible:ring-offset-1"
      >
        <Lock size={14} aria-hidden="true" />
        {label && <span>{label}</span>}
        <span className="rounded bg-[#F5EEE0] px-1.5 py-0.5 text-[11px] text-[#5B6B7D]">Available soon</span>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-[#EFE6D3] bg-white px-3 py-2 text-[12px] leading-snug text-[#0A2540] shadow-[0_8px_24px_rgba(10,37,64,0.12)]"
        >
          {reason}
        </span>
      )}
    </span>
  );
}
