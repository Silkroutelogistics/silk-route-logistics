"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AccountingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Accounting] Error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
        <p className="text-white/50 mb-6 text-sm">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#C8963E] text-[#0F1117] font-semibold rounded-lg hover:bg-[#C8963E]/90 transition"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <a
            href="/accounting"
            className="px-5 py-2.5 text-sm font-medium text-slate-400 border border-white/10 rounded-lg hover:bg-white/5 transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
