"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function CarrierDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CarrierDashboard] Error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-[#F6E3E3] border border-[#9B2C2C]/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-[#9B2C2C]" />
        </div>
        <h2 className="text-xl font-semibold text-[#0A2540] mb-2">Something went wrong</h2>
        <p className="text-slate-500 mb-6 text-sm">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#BA7517] text-[#FBF7F0] font-semibold rounded-lg hover:bg-[#BA7517]/90 transition"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <a
            href="/carrier/dashboard"
            className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-[#EFE6D3] rounded-lg hover:bg-[#F5EEE0] transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
