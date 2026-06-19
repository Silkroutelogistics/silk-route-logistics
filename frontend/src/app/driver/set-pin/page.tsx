"use client";

// v3.8.amz — SRL Driver Academy Sprint T2: driver PIN setup from invite link.
// The carrier-sent link lands here as /driver/set-pin?token=... The token IS
// the authorization (POST /driver-auth/set-pin verifies it). Suspense wrapper
// is MANDATORY for useSearchParams under Next.js static export (output:"export").

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraduationCap, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

function SetPinContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const pinValid = /^\d{6}$/.test(pin);
  const matches = pin === confirm && confirm.length > 0;
  const canSubmit = !!token && pinValid && matches;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/driver-auth/set-pin", { token, pin });
      setDone(true);
      // set-pin auto-issues the session cookie; go straight to the portal.
      setTimeout(() => { window.location.href = "/driver/dashboard"; }, 1200);
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e2?.response?.data?.error || e2?.message || "Could not set your PIN. Try again.");
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
          <h1 className="font-serif text-xl text-[#0A2540] mb-2">Invalid setup link</h1>
          <p className="text-sm text-gray-500">
            This link is missing its setup code. Ask your carrier to send you a fresh SRL Driver Academy invite.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
          <CheckCircle2 size={40} className="mx-auto text-[#2F7A4F] mb-3" />
          <h1 className="font-serif text-xl text-[#0A2540] mb-1">You&apos;re all set</h1>
          <p className="text-sm text-gray-500">Taking you to your training portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A2540] mb-4">
          <GraduationCap size={28} className="text-[#C5A572]" />
        </div>
        <h1 className="font-serif text-2xl text-[#0A2540]">Set your PIN</h1>
        <p className="text-sm text-gray-500 mt-1">Create a 6-digit PIN to access your driver training</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">Choose a 6-digit PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(null); }}
            placeholder="••••••"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 tracking-[0.4em] outline-none transition-all placeholder:text-gray-400 placeholder:tracking-normal focus:border-[#BA7517] focus:shadow-[0_0_0_3px_rgba(197,165,114,0.4)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">Confirm PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(null); }}
            placeholder="••••••"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 tracking-[0.4em] outline-none transition-all placeholder:text-gray-400 placeholder:tracking-normal focus:border-[#BA7517] focus:shadow-[0_0_0_3px_rgba(197,165,114,0.4)]"
          />
          {confirm.length > 0 && !matches && (
            <p className="text-[11px] text-red-600 mt-1">PINs don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-[#BA7517] text-[#FBF7F0] shadow-[0_4px_12px_rgba(186,117,23,0.28)] hover:-translate-y-0.5 hover:bg-[#a3650f] hover:shadow-[0_6px_20px_rgba(186,117,23,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          Activate My Account
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
          <ShieldCheck size={13} /> Keep your PIN private. Your carrier can reset it if you forget.
        </p>
      </form>
    </div>
  );
}

export default function SetPinPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#FBF7F0" }}>
      <Suspense fallback={<Loader2 size={36} className="text-[#BA7517] animate-spin" />}>
        <SetPinContent />
      </Suspense>
    </div>
  );
}
