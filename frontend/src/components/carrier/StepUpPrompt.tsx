"use client";

// The prompt half of step-up (Arc 11 B2). Pairs with hooks/useStepUp.
//
// It names the change it is confirming rather than asking for a code in the
// abstract. "Enter your code" with no subject reads as a session timeout, and a
// carrier who thinks they are re-authenticating will type a code without
// registering what they are authorising — which defeats the point of asking.

import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

export function StepUpPrompt({
  open,
  title,
  description,
  verifying,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  /** What is being confirmed, in the carrier's words. */
  title: string;
  description: string;
  verifying: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length >= 6 && !verifying) onSubmit(code);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2540]/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-lg bg-white border border-[#EFE6D3] shadow-[0_24px_48px_rgba(10,37,64,0.18)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#FAEEDA] flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-[#BA7517]" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-[#0A2540]">{title}</h2>
            <p className="mt-1 text-sm text-[#3A4A5F] leading-relaxed">{description}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-sm text-[#9B2C2C]">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="relative mb-4">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7AEB8]" />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="w-full pl-9 pr-3 py-2.5 font-mono tracking-[0.3em] text-center text-[#0A2540] bg-white border border-[#EFE6D3] rounded-md focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15 outline-none placeholder:text-[#A7AEB8]"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-[#EFE6D3] px-4 py-2.5 text-sm font-medium text-[#3A4A5F] hover:bg-[#FBF7F0] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={code.length < 6 || verifying}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#BA7517] px-4 py-2.5 text-sm font-semibold text-[#FBF7F0] hover:bg-[#A5680F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </button>
          </div>
        </form>

        <p className="mt-3 text-xs text-[#6B7685] text-center leading-relaxed">
          A backup code works here too.
        </p>
      </div>
    </div>
  );
}
