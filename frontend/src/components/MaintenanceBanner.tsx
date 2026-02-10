"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

export function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!MAINTENANCE_MODE || dismissed) return null;

  return (
    <div className="relative z-[60] bg-amber-500/90 text-black px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>We&apos;re making improvements! Some features may be temporarily unavailable.</span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-black/10 rounded p-0.5 transition"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
